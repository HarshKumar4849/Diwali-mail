"use client";

import { useState, useRef, KeyboardEvent, ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { XIcon } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const addEmail = (rawText: string): boolean => {
    const candidates = rawText
      .split(/[,;]+/)
      .map(e => e.trim())
      .filter(Boolean);

    const newValid = candidates.filter(
      cand =>
        EMAIL_RE.test(cand) &&
        !emails.some(existing => existing.toLowerCase() === cand.toLowerCase())
    );

    if (newValid.length > 0) {
      const uniqueNew = Array.from(new Set(newValid));
      const all = [...emails, ...uniqueNew];
      onChange(all.join(", "));
      return true;
    }
    return false;
  };

  const removeEmail = (index: number) => {
    const all = emails.filter((_, i) => i !== index);
    onChange(all.join(", "));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "," || e.key === ";" || e.key === "Enter") {
      e.preventDefault();
      if (input.trim()) {
        addEmail(input);
        setInput("");
      }
    } else if (e.key === "Backspace" && !input && emails.length > 0) {
      removeEmail(emails.length - 1);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.includes(",") || val.includes(";")) {
      const parts = val.split(/[,;]/);
      const current = parts.pop() || "";
      const toAdd = parts.map(p => p.trim()).filter(Boolean);
      if (toAdd.length > 0) {
        addEmail(toAdd.join(", "));
      }
      setInput(current);
    } else {
      setInput(val);
    }
  };

  const handleBlur = () => {
    if (input.trim()) {
      const added = addEmail(input);
      if (added) {
        setInput("");
      }
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
        onBlur={handleBlur}
        placeholder={emails.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm"
      />
    </div>
  );
}
