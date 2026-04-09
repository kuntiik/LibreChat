import { useState, useEffect, useRef, useCallback } from 'react';
import { PixelCard } from '@librechat/client';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import { ToolIcon, isError } from '~/components/Chat/Messages/Content/ToolOutput';
import Image from '~/components/Chat/Messages/Content/Image';
import { useProgress, useLocalize } from '~/hooks';
import ProgressText from './ProgressText';
import { AGENT_STYLE_TOOLS } from '.';
import { scaleImage } from '~/utils';

function computeCancelled(
  isSubmitting: boolean | undefined,
  initialProgress: number,
  hasError: boolean,
): boolean {
  if (isSubmitting !== undefined) {
    return (!isSubmitting && initialProgress < 1) || hasError;
  }
  // Legacy path: in-progress (0 < progress < 1) is never cancelled
  // because legacy image gen lacks a submitting signal.
  if (initialProgress < 1 && initialProgress > 0) {
    return false;
  }
  return hasError;
}

function extractImageUrlFromContent(content: unknown): string | null {
  if (!Array.isArray(content)) {
    return null;
  }

  for (const block of content) {
    if (!block || typeof block !== 'object') {
      continue;
    }
    const { type, image_url } = block as {
      type?: string;
      image_url?: string | { url?: string };
    };
    if (type !== 'image_url') {
      continue;
    }
    if (typeof image_url === 'string' && image_url.length > 0) {
      return image_url;
    }
    if (
      image_url &&
      typeof image_url === 'object' &&
      typeof image_url.url === 'string' &&
      image_url.url.length > 0
    ) {
      return image_url.url;
    }
  }

  return null;
}

function extractMarkdownImagePath(text: string): string | null {
  const match = text.match(/!\[[^\]]*\]\(([^)]+)\)/);
  return match?.[1] ?? null;
}

type OutputImageMetadata = {
  filepath?: string | null;
  filename?: string;
  width?: number;
  height?: number;
  content?: unknown;
  artifact?: unknown;
  url?: string;
};

function collectOutputMetadata(value: unknown): OutputImageMetadata | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    if (value.length > 1) {
      return collectOutputMetadata(value[1]);
    }
    return null;
  }

  if (typeof value !== 'object') {
    return null;
  }

  const candidate = value as OutputImageMetadata & { output?: unknown };

  const outputNested = collectOutputMetadata(candidate.output);
  if (outputNested) {
    return { ...candidate, ...outputNested };
  }

  return candidate;
}

function resolveOutputFilepath(metadata: OutputImageMetadata | null): string | null {
  if (!metadata) {
    return null;
  }

  if (typeof metadata.filepath === 'string' && metadata.filepath.length > 0) {
    return metadata.filepath;
  }
  if (typeof metadata.url === 'string' && metadata.url.length > 0) {
    return metadata.url;
  }

  const artifact = metadata.artifact as { content?: unknown; filepath?: string; url?: string } | undefined;
  if (artifact) {
    if (typeof artifact.filepath === 'string' && artifact.filepath.length > 0) {
      return artifact.filepath;
    }
    if (typeof artifact.url === 'string' && artifact.url.length > 0) {
      return artifact.url;
    }
    const artifactUrl = extractImageUrlFromContent(artifact.content);
    if (artifactUrl) {
      return artifactUrl;
    }
  }

  const contentUrl = extractImageUrlFromContent(metadata.content);
  if (contentUrl) {
    return contentUrl;
  }

  return null;
}

export default function OpenAIImageGen({
  initialProgress = 0.1,
  isSubmitting,
  toolName,
  args: _args = '',
  output,
  attachments,
}: {
  initialProgress: number;
  isSubmitting?: boolean;
  toolName?: string;
  args: string | Record<string, unknown>;
  output?: unknown;
  attachments?: TAttachment[];
}) {
  const localize = useLocalize();
  const isAgentStyle = toolName != null && AGENT_STYLE_TOOLS.has(toolName);
  const [agentProgress, setAgentProgress] = useState(initialProgress);
  const legacyProgress = useProgress(isAgentStyle ? 1 : initialProgress);
  const progress = isAgentStyle ? agentProgress : legacyProgress;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const hasError = typeof output === 'string' && isError(output);

  /**
   * Determines if the image generation was cancelled.
   * - Agent path (isSubmitting defined): cancelled if not submitting + incomplete, or on error.
   * - Legacy path (isSubmitting undefined): in-progress (0 < progress < 1) is never cancelled
   *   because legacy image gen lacks a submitting signal — only errors cancel.
   */
  const cancelled = computeCancelled(isSubmitting, initialProgress, hasError);

  let width: number | undefined;
  let height: number | undefined;
  let quality: 'low' | 'medium' | 'high' = 'high';

  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = typeof _args === 'string' ? JSON.parse(_args) : _args;
  } catch {
    parsedArgs = {};
  }

  try {
    const argsObj = parsedArgs;

    if (argsObj && typeof argsObj.size === 'string') {
      const [w, h] = argsObj.size.split('x').map((v: string) => parseInt(v, 10));
      if (!isNaN(w) && !isNaN(h)) {
        width = w;
        height = h;
      }
    } else if (argsObj && (typeof argsObj.size !== 'string' || !argsObj.size)) {
      width = undefined;
      height = undefined;
    }

    if (argsObj && typeof argsObj.quality === 'string') {
      const q = argsObj.quality.toLowerCase();
      if (q === 'low' || q === 'medium' || q === 'high') {
        quality = q;
      }
    }
  } catch {
    width = undefined;
    height = undefined;
  }

  const attachment = attachments?.find((item) => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const candidate = item as TFile & { url?: string };
    if (typeof candidate.filepath === 'string' && candidate.filepath.length > 0) {
      return true;
    }
    return typeof candidate.url === 'string' && candidate.url.length > 0;
  });

  const attachmentFilepath =
    (attachment as (TFile & { url?: string }) | undefined)?.filepath ??
    (attachment as (TFile & { url?: string }) | undefined)?.url ??
    null;
  const {
    width: imageWidth,
    height: imageHeight,
    filepath = attachmentFilepath,
    filename = '',
  } = (attachment as TFile & TAttachmentMetadata) || {};

  let origWidth = width ?? imageWidth;
  let origHeight = height ?? imageHeight;

  // Legacy image tool-call output can include metadata in a tuple:
  // [instructionText, { filepath, filename, width, height, ... }]
  // Use it as a fallback when attachments aren't present.
  let outputImagePath: string | null = null;
  let outputImageMetadata = collectOutputMetadata(output);
  if (typeof output === 'string') {
    outputImagePath = extractMarkdownImagePath(output);
    try {
      const parsedOutput = JSON.parse(output);
      const parsedMetadata = collectOutputMetadata(parsedOutput);
      if (parsedMetadata) {
        outputImageMetadata = parsedMetadata;
      }
    } catch {
      /* noop */
    }
  }
  const outputFilepath = resolveOutputFilepath(outputImageMetadata);

  const resolvedFilepath = filepath ?? outputFilepath ?? outputImagePath ?? null;
  const resolvedFilename = filename || outputImageMetadata?.filename || '';
  const hasResolvedFilepath =
    typeof resolvedFilepath === 'string' && resolvedFilepath.trim().length > 0;
  const fluxDebugPath =
    toolName === 'flux' ? resolvedFilepath ?? outputFilepath ?? outputImagePath ?? null : null;
  const showFluxDebugPath = typeof fluxDebugPath === 'string' && fluxDebugPath.trim().length > 0;
  if (origWidth == null && outputImageMetadata?.width != null) {
    origWidth = outputImageMetadata.width;
  }
  if (origHeight == null && outputImageMetadata?.height != null) {
    origHeight = outputImageMetadata.height;
  }

  if (origWidth === undefined || origHeight === undefined) {
    origWidth = 1024;
    origHeight = 1024;
  }

  const [dimensions, setDimensions] = useState({ width: 'auto', height: 'auto' });
  const containerRef = useRef<HTMLDivElement>(null);

  const updateDimensions = useCallback(() => {
    if (origWidth && origHeight && containerRef.current) {
      const scaled = scaleImage({
        originalWidth: origWidth,
        originalHeight: origHeight,
        containerRef,
      });
      setDimensions(scaled);
    }
  }, [origWidth, origHeight]);

  useEffect(() => {
    if (!isAgentStyle) {
      return;
    }

    if (isSubmitting) {
      setAgentProgress(initialProgress);

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      let baseDuration = 20000;
      if (quality === 'low') {
        baseDuration = 10000;
      } else if (quality === 'high') {
        baseDuration = 50000;
      }
      const jitter = Math.floor(baseDuration * 0.3);
      const totalDuration = Math.floor(Math.random() * jitter) + baseDuration;
      const updateInterval = 200;
      const totalSteps = totalDuration / updateInterval;
      let currentStep = 0;

      intervalRef.current = setInterval(() => {
        currentStep++;

        if (currentStep >= totalSteps) {
          clearInterval(intervalRef.current as NodeJS.Timeout);
          setAgentProgress(0.9);
        } else {
          const progressRatio = currentStep / totalSteps;
          let mapRatio: number;
          if (progressRatio < 0.8) {
            mapRatio = Math.pow(progressRatio, 1.1);
          } else {
            const sub = (progressRatio - 0.8) / 0.2;
            mapRatio = 0.8 + (1 - Math.pow(1 - sub, 2)) * 0.2;
          }
          const scaledProgress = 0.1 + mapRatio * 0.8;

          setAgentProgress(scaledProgress);
        }
      }, updateInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isSubmitting, initialProgress, quality, isAgentStyle]);

  useEffect(() => {
    if (!isAgentStyle) {
      return;
    }

    if (initialProgress >= 1 || cancelled) {
      setAgentProgress(initialProgress);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
  }, [initialProgress, cancelled, isAgentStyle]);

  useEffect(() => {
    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [updateDimensions]);

  const isInProgress = progress < 1 && !cancelled;

  return (
    <>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {(() => {
          if (progress < 1 && !cancelled) {
            return '';
          }
          if (cancelled && hasError) {
            return localize('com_ui_image_gen_failed');
          }
          if (cancelled) {
            return localize('com_ui_cancelled');
          }
          return localize('com_ui_image_created');
        })()}
      </span>
      <div className="relative my-1 flex h-5 shrink-0 items-center gap-2">
        <ToolIcon type="image_gen" isAnimating={isInProgress} />
        <ProgressText progress={progress} error={cancelled} toolName={toolName} />
      </div>
      {isAgentStyle && (
        <div className="relative mb-2 flex w-full justify-start">
          <div ref={containerRef} className="w-full max-w-lg">
            {dimensions.width !== 'auto' && progress < 1 && (
              <PixelCard
                variant="default"
                progress={progress}
                randomness={0.6}
                width={dimensions.width}
                height={dimensions.height}
              />
            )}
            {hasResolvedFilepath && (
              <Image
                altText={resolvedFilename}
                imagePath={resolvedFilepath}
                width={Number(dimensions.width?.split('px')[0])}
                height={Number(dimensions.height?.split('px')[0])}
                args={parsedArgs}
              />
            )}
            {showFluxDebugPath && (
              <div className="mt-1 break-all text-xs text-text-secondary">{fluxDebugPath}</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
