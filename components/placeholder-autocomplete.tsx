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
    value,
    placeholder,
    id,
    onKeyDown: handleKeyDown,
    onChange: onChangeHandler,
  };

  return (
    <div className="space-y-1.5 relative">
      <label className="block text-sm font-semibold text-foreground">{label}</label>
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          {...commonProps}
          rows={rows || 8}
          className="flex w-full rounded-xl border border-input/90 bg-background px-3.5 py-2.5 text-sm shadow-2xs transition-all duration-150 placeholder:text-muted-foreground hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono leading-relaxed"
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          {...commonProps}
          className="flex w-full rounded-xl border border-input/90 bg-background px-3.5 py-2.5 text-sm shadow-2xs transition-all duration-150 placeholder:text-muted-foreground hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      )}
      {showDropdown && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-64 max-h-52 overflow-y-auto rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-1 shadow-lg animate-in fade-in-50 zoom-in-95 duration-150"
        >
          <div className="px-2.5 py-1 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider border-b border-border/40 mb-1">
            Insert Column Tag
          </div>
          {filtered.map((col, i) => (
            <button
              key={col}
              type="button"
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors text-left ${
                i === selectedIdx
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-foreground hover:bg-muted/80"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                insertColumn(col);
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <span>{'{{' + col + '}}'}</span>
              <span className={`text-[10px] ${i === selectedIdx ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                Tab
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
