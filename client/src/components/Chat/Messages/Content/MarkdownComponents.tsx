import React, { memo, useMemo, useRef, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useToastContext } from '@librechat/client';
import { PermissionTypes, Permissions, apiBaseUrl } from 'librechat-data-provider';
import MermaidErrorBoundary from '~/components/Messages/Content/MermaidErrorBoundary';
import CodeBlock from '~/components/Messages/Content/CodeBlock';
import Mermaid from '~/components/Messages/Content/Mermaid';
import useHasAccess from '~/hooks/Roles/useHasAccess';
import { useFileDownload } from '~/data-provider';
import { useCodeBlockContext } from '~/Providers';
import { handleDoubleClick } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

type TCodeProps = {
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
};

export const code: React.ElementType = memo(({ className, children }: TCodeProps) => {
  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];
  const isMath = lang === 'math';
  const isMermaid = lang === 'mermaid';
  const isSingleLine = typeof children === 'string' && children.split('\n').length === 1;

  const { getNextIndex, resetCounter } = useCodeBlockContext();
  const blockIndex = useRef(getNextIndex(isMath || isMermaid || isSingleLine)).current;

  useEffect(() => {
    resetCounter();
  }, [children, resetCounter]);

  if (isMath) {
    return <>{children}</>;
  } else if (isMermaid) {
    const content = typeof children === 'string' ? children : String(children);
    return (
      <MermaidErrorBoundary code={content}>
        <Mermaid id={`mermaid-${blockIndex}`}>{content}</Mermaid>
      </MermaidErrorBoundary>
    );
  } else if (isSingleLine) {
    return (
      <code onDoubleClick={handleDoubleClick} className={className}>
        {children}
      </code>
    );
  } else {
    return (
      <CodeBlock
        lang={lang ?? 'text'}
        codeChildren={children}
        blockIndex={blockIndex}
        allowExecution={canRunCode}
      />
    );
  }
});

export const codeNoExecution: React.ElementType = memo(({ className, children }: TCodeProps) => {
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];

  if (lang === 'math') {
    return children;
  } else if (lang === 'mermaid') {
    const content = typeof children === 'string' ? children : String(children);
    return <Mermaid>{content}</Mermaid>;
  } else if (typeof children === 'string' && children.split('\n').length === 1) {
    return (
      <code onDoubleClick={handleDoubleClick} className={className}>
        {children}
      </code>
    );
  } else {
    return <CodeBlock lang={lang ?? 'text'} codeChildren={children} allowExecution={false} />;
  }
});

type TAnchorProps = {
  href: string;
  children: React.ReactNode;
};


export const a: React.ElementType = memo(({ href, children }: TAnchorProps) => {
  const user = useRecoilValue(store.user);
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const {
    file_id = '',
    filename = '',
    filepath,
  } = useMemo(() => {
    const pattern = new RegExp(`(?:files|outputs)/${user?.id}/([^\\s]+)`);
    const match = href.match(pattern);
    if (match && match[0]) {
      const path = match[0];
      const parts = path.split('/');
      const name = parts.pop();
      const file_id = parts.pop();
      return { file_id, filename: name, filepath: path };
    }
    return { file_id: '', filename: '', filepath: '' };
  }, [user?.id, href]);

  const { refetch: downloadFile } = useFileDownload(user?.id ?? '', file_id);
  const props: { target?: string; onClick?: React.MouseEventHandler } = { target: '_blank' };

  // compute final link href for both download logic and image detection
  const computeHref = () => {
    if (file_id && filename) {
      const domainServerBaseUrl = `${apiBaseUrl()}/api`;
      return filepath?.startsWith('files/')
        ? `${domainServerBaseUrl}/${filepath}`
        : `${domainServerBaseUrl}/files/${filepath}`;
    }
    return href;
  };
  const finalHref = computeHref();

  // helper to flatten any nested React children into plaintext
  const getText = (node: React.ReactNode): string => {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(getText).join('');
    if (React.isValidElement(node)) return getText(node.props.children);
    return '';
  };

  // Determine if href is an image from this server only.
  const baseURL = apiBaseUrl();
  const serverOrigin = (() => {
    try {
      return new URL(baseURL, window.location.origin).origin;
    } catch {
      return '';
    }
  })();
  const imageExtRegex = /\.(png|jpe?g|gif|bmp|webp|svg)(\?.*)?$/i;
  const isLocalImage = (() => {
    try {
      const resolvedUrl = new URL(finalHref, window.location.origin);
      return (
        resolvedUrl.origin === serverOrigin &&
        resolvedUrl.pathname.startsWith('/images/') &&
        imageExtRegex.test(resolvedUrl.pathname + resolvedUrl.search)
      );
    } catch {
      return false;
    }
  })();

  // if the computed href points at an image, render an <img> immediately
  if (isLocalImage) {
    return <img src={finalHref} alt={getText(children)} />;
  }

  // legacy special case where the server returns the raw URL text and that
  // text exactly matches the boolean evaluation above was a mistake; it
  // never worked reliably and isn't needed anymore, so drop it.

  if (!file_id || !filename) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }

  const handleDownload = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      const stream = await downloadFile();
      if (stream.data == null || stream.data === '') {
        console.error('Error downloading file: No data found');
        showToast({
          status: 'error',
          message: localize('com_ui_download_error'),
        });
        return;
      }
      const link = document.createElement('a');
      link.href = stream.data;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(stream.data);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  props.onClick = handleDownload;
  props.target = '_blank';

  const domainServerBaseUrl = `${apiBaseUrl()}/api`;

  return (
    <a
      href={
        filepath?.startsWith('files/')
          ? `${domainServerBaseUrl}/${filepath}`
          : `${domainServerBaseUrl}/files/${filepath}`
      }
      {...props}
    >
      {children}
    </a>
  );
});

type TParagraphProps = {
  children: React.ReactNode;
};

export const p: React.ElementType = memo(({ children }: TParagraphProps) => {
  return <p className="mb-2 whitespace-pre-wrap">{children}</p>;
});

type TImageProps = {
  src?: string;
  alt?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
};

export const img: React.ElementType = memo(({ src, alt, title, className, style }: TImageProps) => {
  const baseURL = apiBaseUrl();

  // Resolve relative image paths against our API base URL.
  const resolvedSrc = useMemo(() => {
    if (!src) return src;
    if (src.startsWith('data:')) return src;
    if (src.startsWith('/')) return `${baseURL}${src}`;
    return src;
  }, [src, baseURL]);

  const shouldRenderImage = useMemo(() => {
    if (!resolvedSrc) return false;
    if (resolvedSrc.startsWith('data:')) return false;
    try {
      const serverOrigin = new URL(baseURL, window.location.origin).origin;
      const imageUrl = new URL(resolvedSrc, window.location.origin);
      return imageUrl.origin === serverOrigin && imageUrl.pathname.startsWith('/images/');
    } catch {
      return false;
    }
  }, [resolvedSrc, baseURL]);

  if (!shouldRenderImage) {
    return (
      <a href={resolvedSrc ?? src} target="_blank" rel="noreferrer">
        {alt || title || src}
      </a>
    );
  }

  return <img src={resolvedSrc} alt={alt} title={title} className={className} style={style} />;
});
