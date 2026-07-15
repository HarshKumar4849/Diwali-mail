"use client";

import { useState, useRef, useEffect, useMemo, useCallback, memo, type KeyboardEvent } from "react";

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

function detectPlaceholder(val: string, cursorPos: number) {
  const before = val.slice(0, cursorPos);
  const openIdx = before.lastIndexOf("{{");
  if (openIdx === -1) return null;
  const afterOpen = before.slice(openIdx + 2);
  if (afterOpen.includes("}}")) return null;
  return { start: openIdx, end: cursorPos, typed: afterOpen };
}

export const PlaceholderAutocomplete = memo(function PlaceholderAutocomplete({
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const insertPosRef = useRef<{ start: number; end: number } | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const [showDropdown, setShowDropdown] = useState(false);
  const [filter, setFilter] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const filtered = useMemo(
    () => columns.filter((c) => c.toLowerCase().includes(filter.toLowerCase())),
    [columns, filter]
  );

  const handleInput = useCallback(function handleInput(val: string, cursorPos: number) {
    onChange(val);
    const match = detectPlaceholder(val, cursorPos);
    if (match) {
      setFilter(match.typed);
      insertPosRef.current = { start: match.start, end: match.end };
      setShowDropdown(true);
      setSelectedIdx(0);
    } else {
      setShowDropdown(false);
    }
  }, [onChange]);

  const insertColumn = useCallback(function insertColumn(col: string) {
    const pos = insertPosRef.current;
    if (!pos) return;
    const curVal = valueRef.current;
    const before = curVal.slice(0, pos.start);
    const after = curVal.slice(pos.end);
    const tag = `{{${col}}}`;
    const newVal = before + tag + after;
    onChange(newVal);
    setShowDropdown(false);
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const cursorPos = pos.start + tag.length;
        inputRef.current.setSelectionRange(cursorPos, cursorPos);
        inputRef.current.focus();
      }
    });
  }, [onChange]);

  const handleKeyDown = useCallback(function handleKeyDown(e: KeyboardEvent) {
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
  }, [showDropdown, filtered, selectedIdx, insertColumn]);

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

  const onChangeHandler = useCallback(function onChangeHandler(
    e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) {
    const cursor = (e.target as HTMLTextAreaElement | HTMLInputElement).selectionStart ?? 0;
    handleInput(e.target.value, cursor);
  }, [handleInput]);

  const commonProps = {
    ref: inputRef as any,
    value,
    placeholder,
    id,
    onKeyDown: handleKeyDown,
    onChange: onChangeHandler,
  };

  return (
    <div className="space-y-1 relative">
      <label className="block text-sm font-medium">{label}</label>
      {multiline ? (
        <textarea
          {...commonProps}
          rows={rows || 6}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm font-mono"
        />
      ) : (
        <input
          {...commonProps}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
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
});
