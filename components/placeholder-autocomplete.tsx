"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";

interface Props {
  value: string;
  onChange: (val: string) => void;
  columns: string[];
  placeholder?: string;
  rows?: number;
  id?: string;
  label: string;
  multiline?: boolean;
}

export function PlaceholderAutocomplete({
  value,
  onChange,
  columns,
  placeholder,
  rows,
  id,
  label,
  multiline,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filter, setFilter] = useState("");
  const [insertPos, setInsertPos] = useState<{ start: number; end: number } | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = columns.filter((c) =>
    c.toLowerCase().includes(filter.toLowerCase())
  );

  function detectPlaceholder(val: string, cursorPos: number) {
    const before = val.slice(0, cursorPos);
    const openIdx = before.lastIndexOf("{{");
    if (openIdx === -1) return null;
    const afterOpen = before.slice(openIdx + 2);
    if (afterOpen.includes("}}")) return null;
    return { start: openIdx, end: cursorPos, typed: afterOpen };
  }

  function handleInput(val: string, cursorPos: number) {
    onChange(val);
    const match = detectPlaceholder(val, cursorPos);
    if (match) {
      setFilter(match.typed);
      setInsertPos({ start: match.start, end: match.end });
      setShowDropdown(true);
      setSelectedIdx(0);
    } else {
      setShowDropdown(false);
    }
  }

  function insertColumn(col: string) {
    if (!insertPos) return;
    const before = value.slice(0, insertPos.start);
    const after = value.slice(insertPos.end);
    const tag = `{{${col}}}`;
    const newVal = before + tag + after;
    onChange(newVal);
    setShowDropdown(false);
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const pos = insertPos.start + tag.length;
        inputRef.current.setSelectionRange(pos, pos);
        inputRef.current.focus();
      }
    });
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!showDropdown || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      insertColumn(filtered[selectedIdx]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown]);

  const common = {
    ref: inputRef as any,
    value,
    placeholder,
    id,
    onKeyDown: handleKeyDown,
  };

  return (
    <div className="space-y-1 relative">
      <label className="block text-sm font-medium">{label}</label>
      {multiline ? (
        <textarea
          {...common}
          rows={rows || 6}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm font-mono"
          onChange={(e) => {
            const cursor = e.target.selectionStart;
            handleInput(e.target.value, cursor);
          }}
          onSelect={(e) => {
            const cursor = (e.target as HTMLTextAreaElement).selectionStart;
            const match = detectPlaceholder(value, cursor);
            if (match) {
              setFilter(match.typed);
              setInsertPos({ start: match.start, end: match.end });
              setShowDropdown(true);
              setSelectedIdx(0);
            } else {
              setShowDropdown(false);
            }
          }}
        />
      ) : (
        <input
          {...common}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
          onChange={(e) => {
            const cursor = e.target.selectionStart!;
            handleInput(e.target.value, cursor);
          }}
          onSelect={(e) => {
            const cursor = (e.target as HTMLInputElement).selectionStart!;
            const match = detectPlaceholder(value, cursor);
            if (match) {
              setFilter(match.typed);
              setInsertPos({ start: match.start, end: match.end });
              setShowDropdown(true);
              setSelectedIdx(0);
            } else {
              setShowDropdown(false);
            }
          }}
        />
      )}
      {showDropdown && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-64 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md"
        >
          {filtered.map((col, i) => (
            <button
              key={col}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-accent ${
                i === selectedIdx ? "bg-accent text-accent-foreground" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                insertColumn(col);
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              {'{{' + col + '}}'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
