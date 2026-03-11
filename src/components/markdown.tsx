import { memo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const DISALLOWED_ELEMENTS = ["h1", "h2", "h3", "h4", "h5", "h6", "hr", "img"];

function makeComponents(prefix?: ReactNode): Components {
  let prefixInserted = false;

  return {
    p: ({ children }) => {
      if (!prefixInserted && prefix) {
        prefixInserted = true;
        return <p className="mb-3 last:mb-0">{prefix}{children}</p>;
      }
      return <p className="mb-3 last:mb-0">{children}</p>;
    },
    strong: ({ children }) => (
      <strong className="font-bold text-accent-300">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    ul: ({ children }) => (
      <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>
    ),
    code: ({ children, className }) => {
      const isBlock = className?.includes("language-");
      if (isBlock) {
        return <code className={className}>{children}</code>;
      }
      return (
        <code className="bg-gray-800/50 px-1.5 py-0.5 rounded text-accent-400">
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="bg-gray-800/50 rounded p-3 mb-3 overflow-x-auto">
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-accent-500 pl-3 italic text-gray-400 mb-3">
        {children}
      </blockquote>
    ),
  };
}

const defaultComponents = makeComponents();

function MarkdownRenderer({ content, prefix }: { content: string; prefix?: ReactNode }) {
  const components = prefix ? makeComponents(prefix) : defaultComponents;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components}
      disallowedElements={DISALLOWED_ELEMENTS}
      unwrapDisallowed
    >
      {content}
    </ReactMarkdown>
  );
}

export const Markdown = memo(MarkdownRenderer, (prev, next) =>
  prev.content === next.content && prev.prefix === next.prefix
);
