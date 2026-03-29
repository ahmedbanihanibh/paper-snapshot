import type { Component } from "solid-js";

interface IconSubmitProps {
  size?: number;
  class?: string;
}

export const IconSubmit: Component<IconSubmitProps> = (props) => {
  const size = () => props.size ?? 12;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size()}
      height={size()}
      viewBox="0 0 12 12"
      fill="none"
      class={props.class}
    >
      <path
        d="M6 1L6 11M6 1L2 5M6 1L10 5"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
};
