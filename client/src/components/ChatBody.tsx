import type { ReactNode } from "react";

// A chat message: plain text with clickable links, plus the screenshots attached to it. Text is never inserted as HTML (React escapes
// it), and only http(s) links become anchors, so a message cannot run script or smuggle a javascript: link.

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function linkify(text: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 0) return part;
    const trimmed = part.replace(/[.,;:!?)\]]+$/, ""); // punctuation after a link is not part of it
    const tail = part.slice(trimmed.length);
    return (
      <span key={i}>
        <a href={trimmed} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 break-all">{trimmed}</a>
        {tail}
      </span>
    );
  });
}

export default function ChatBody({ text, attachments }: { text: string; attachments?: { url: string; name: string }[] }) {
  return (
    <>
      {text && <p className="whitespace-pre-wrap break-words">{linkify(text)}</p>}
      {attachments && attachments.length > 0 && (
        <div className={`${text ? "mt-2 " : ""}grid gap-1.5 ${attachments.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {attachments.map((a) => (
            <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" title={a.name} className="block overflow-hidden rounded-lg bg-black/10">
              <img src={a.url} alt={a.name} loading="lazy" referrerPolicy="no-referrer" className="max-h-44 w-full object-cover" />
            </a>
          ))}
        </div>
      )}
    </>
  );
}
