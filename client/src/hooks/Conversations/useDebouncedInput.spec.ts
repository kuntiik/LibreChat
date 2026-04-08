import { act, renderHook } from '@testing-library/react';
import useDebouncedInput from './useDebouncedInput';

describe('useDebouncedInput', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('preserves pending debounced updates when callback identity changes', () => {
    const setterA = jest.fn();
    const setterB = jest.fn();

    const setOptionA = jest.fn(() => setterA);
    const setOptionB = jest.fn(() => setterB);

    const { result, rerender } = renderHook(
      ({ setOption }) =>
        useDebouncedInput<number>({
          setOption,
          optionKey: 'temperature',
          initialValue: 1,
          delay: 100,
        }),
      { initialProps: { setOption: setOptionA } },
    );

    act(() => {
      result.current[0](0.7);
    });

    rerender({ setOption: setOptionB });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(setterA).not.toHaveBeenCalled();
    expect(setterB).toHaveBeenCalledTimes(1);
    expect(setterB).toHaveBeenCalledWith(0.7);
  });

  it('routes new debounced updates to the latest callback', () => {
    const setterA = jest.fn();
    const setterB = jest.fn();

    const setOptionA = jest.fn(() => setterA);
    const setOptionB = jest.fn(() => setterB);

    const { result, rerender } = renderHook(
      ({ setOption }) =>
        useDebouncedInput<number>({
          setOption,
          optionKey: 'temperature',
          initialValue: 1,
          delay: 100,
        }),
      { initialProps: { setOption: setOptionA } },
    );

    rerender({ setOption: setOptionB });

    act(() => {
      result.current[0](0.6);
      jest.advanceTimersByTime(100);
    });

    expect(setterA).not.toHaveBeenCalled();
    expect(setterB).toHaveBeenCalledTimes(1);
    expect(setterB).toHaveBeenCalledWith(0.6);
  });
});
