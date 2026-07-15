"use client";

import { useState, useRef, KeyboardEvent, ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { XIcon } from "lucide-react";

export function EmailInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const emails = value ? value.split(",").map(e => e.trim()).filter(Boolean) : [];

  const addEmail = (email: string) => {
    const trimmed = email.trim();
    if (trimmed) {
      const all = [...emails, trimmed];
      onChange(all.join(", "));
    }
  };

  const removeEmail = (index: number) => {
    const all = emails.filter((_, i) => i !== index);
    onChange(all.join(", "));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      addEmail(input);
      setInput("");
    } else if (e.key === "Backspace" && !input && emails.length > 0) {
      removeEmail(emails.length - 1);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.includes(",")) {
      const parts = val.split(",");
      const current = parts.pop() || "";
      const all = [...emails, ...parts.map(p => p.trim()).filter(Boolean)];
      onChange(all.join(", "));
      setInput(current);
    } else {
      setInput(val);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 p-2 border rounded bg-background cursor-text min-h-[42px]"
      onClick={() => inputRef.current?.focus()}
    >
      {emails.map((email, i) => (
        <Badge key={i} variant="secondary" className="gap-1 pl-2 pr-1 text-xs py-0 h-auto">
          <span className="max-w-[200px] truncate">{email}</span>
          <button
            type="button"
            className="ml-0.5 hover:text-destructive transition-colors shrink-0"
            onClick={(e) => { e.stopPropagation(); removeEmail(i); }}
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={emails.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm"
      />
    </div>
  );
}
