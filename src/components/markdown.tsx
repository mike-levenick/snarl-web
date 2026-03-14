import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const DISALLOWED_ELEMENTS = ["h1", "h2", "h3", "h4", "h5", "h6", "hr", "img"];

function makeComponents(prefix?: string): Components {
  let prefixInserted = false;

  const prefixNode = prefix ? (
    <span className="text-accent-500 font-bold">{prefix} </span>
  ) : null;

  return {
    p: ({ children }) => {
      if (!prefixInserted && prefixNode) {
        prefixInserted = true;
        return <p className="mb-3 last:mb-0">{prefixNode}{children}</p>;
      }
      return <p className="mb-3 last:mb-0">{children}</p>;
    },
    strong: ({ children }) => (
      <strong className="font-bold text-accent-300">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    ul: ({ children }) => {
      if (!prefixInserted && prefixNode) {
        prefixInserted = true;
        return (
          <>
            <p className="mb-3">{prefixNode}</p>
            <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>
          </>
        );
      }
      return <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>;
    },
    ol: ({ children }) => {
      if (!prefixInserted && prefixNode) {
        prefixInserted = true;
        return (
          <>
            <p className="mb-3">{prefixNode}</p>
            <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>
          </>
        );
      }
      return <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>;
    },
    blockquote: ({ children }) => {
      if (!prefixInserted && prefixNode) {
        prefixInserted = true;
        return (
          <>
            <p className="mb-3">{prefixNode}</p>
            <blockquote className="border-l-2 border-accent-500 pl-3 italic text-gray-400 mb-3">
              {children}
            </blockquote>
          </>
        );
      }
      return (
        <blockquote className="border-l-2 border-accent-500 pl-3 italic text-gray-400 mb-3">
          {children}
        </blockquote>
      );
    },
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
  };
}

const defaultComponents = makeComponents();

function MarkdownRenderer({ content, prefix }: { content: string; prefix?: string }) {
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
