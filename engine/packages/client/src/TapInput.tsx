// A text box that takes focus from the tap itself. iOS WebKit drops the click
// of a tap that lands while something on the page is coming into view (it takes
// the tap for a hover), and a text box only focuses on that click; with the
// splash painting animating behind the sign-in, a tap on the box could take
// several tries. Focusing on touchend is still a user gesture, so the keyboard
// opens. A touch that moved was a scroll, and leaves the box alone.

import { useRef } from "react";
import { TextInput, type GestureResponderEvent, type TextInputProps } from "react-native";

export function TapInput(props: TextInputProps) {
  const input = useRef<TextInput>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <TextInput
      ref={input}
      {...props}
      onTouchStart={(event: GestureResponderEvent) => {
        start.current = point(event);
        props.onTouchStart?.(event);
      }}
      onTouchEnd={(event: GestureResponderEvent) => {
        const from = start.current;
        const to = point(event);
        if (from && Math.abs(to.x - from.x) < 10 && Math.abs(to.y - from.y) < 10 && !input.current?.isFocused()) input.current?.focus();
        props.onTouchEnd?.(event);
      }}
    />
  );
}

/** Where a touch is: on the web the event is the browser's own, which keeps it in changedTouches. */
function point(event: GestureResponderEvent) {
  const touch = (event.nativeEvent as unknown as { changedTouches?: ArrayLike<{ pageX: number; pageY: number }> }).changedTouches?.[0] ?? event.nativeEvent;
  return { x: touch.pageX, y: touch.pageY };
}
