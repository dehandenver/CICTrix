/**
 * CompetencyTagInput — chip/tag input with autocomplete for tagging trainings
 * with competencies from the master taxonomy.
 *
 * Behaviour:
 *  - Type a competency name; autocomplete shows fuzzy-matched options.
 *  - Press Enter / comma / Tab to commit a chip (creates the tag in DB if new).
 *  - Click "× Create '<name>'" to create a brand-new competency.
 *  - Click × on any chip to remove it.
 *  - Duplicate detection by nameKey (normalised), not display text.
 *  - Chips wrap; the input area grows/scrolls naturally (max-height via CSS).
 *  - No upper limit on tag count.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';
import type { CompetencyTag } from '../lib/api/trainingCompetencies';
import { normalizeTagKey } from '../lib/api/trainingCompetencies';

// ── Props ─────────────────────────────────────────────────────────────────────

export type CompetencyTagInputProps = {
  /** Currently selected tags (controlled). */
  value: CompetencyTag[];
  /** Called whenever the selection changes. */
  onChange: (tags: CompetencyTag[]) => void;
  /** Full master list — drives the autocomplete dropdown. */
  allTags: CompetencyTag[];
  /**
   * Called when the admin types a name that doesn't exist yet and commits it.
   * Should create the tag in the DB and return the full tag object (or null on error).
   */
  onCreateTag: (name: string) => Promise<CompetencyTag | null>;
  placeholder?: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export const CompetencyTagInput = ({
  value,
  onChange,
  allTags,
  onCreateTag,
  placeholder = 'Add a competency…',
}: CompetencyTagInputProps) => {
  const [inputText, setInputText] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside.
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const selectedKeys = new Set(value.map((t) => t.nameKey));

  const filtered = allTags.filter((t) => {
    if (selectedKeys.has(t.nameKey)) return false; // already added
    if (!inputText.trim()) return true;             // show all when input empty
    return (
      t.name.toLowerCase().includes(inputText.toLowerCase()) ||
      t.nameKey.includes(normalizeTagKey(inputText))
    );
  });

  const typedKey = normalizeTagKey(inputText.trim());
  const exactMatch = allTags.some((t) => t.nameKey === typedKey);
  const alreadySelected = selectedKeys.has(typedKey);
  const showCreate = inputText.trim().length > 1 && !exactMatch && !alreadySelected;

  // ── Actions ──────────────────────────────────────────────────────────────────

  const addTag = (tag: CompetencyTag) => {
    if (selectedKeys.has(tag.nameKey)) return; // guard against duplicates
    onChange([...value, tag]);
    setInputText('');
    setDropdownOpen(false);
    inputRef.current?.focus();
  };

  const removeTag = (nameKey: string) => {
    onChange(value.filter((t) => t.nameKey !== nameKey));
  };

  const commitText = async (text: string) => {
    const trimmed = text.trim().replace(/,$/, '').trim();
    if (!trimmed) return;
    const key = normalizeTagKey(trimmed);
    if (selectedKeys.has(key)) {
      setInputText('');
      return;
    }
    // Exact match in master list → add directly without DB write.
    const existing = allTags.find((t) => t.nameKey === key);
    if (existing) {
      addTag(existing);
      return;
    }
    // New competency → create in DB.
    setCreating(true);
    const created = await onCreateTag(trimmed);
    setCreating(false);
    if (created) addTag(created);
    else setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      void commitText(inputText);
    } else if (e.key === 'Backspace' && !inputText && value.length > 0) {
      // Remove the last tag when backspacing on empty input.
      onChange(value.slice(0, -1));
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    } else if (e.key === 'Tab' && inputText.trim()) {
      e.preventDefault();
      void commitText(inputText);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const chipColors = [
    'bg-indigo-50 text-indigo-700 border-indigo-200',
    'bg-violet-50 text-violet-700 border-violet-200',
    'bg-blue-50 text-blue-700 border-blue-200',
    'bg-cyan-50 text-cyan-700 border-cyan-200',
    'bg-teal-50 text-teal-700 border-teal-200',
    'bg-emerald-50 text-emerald-700 border-emerald-200',
  ];
  const chipColor = (idx: number) => chipColors[idx % chipColors.length];

  return (
    <div ref={containerRef} className="relative">
      {/* Tag container + inline input */}
      <div
        className="flex min-h-[2.5rem] w-full cursor-text flex-wrap gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm transition-colors focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
        onClick={() => inputRef.current?.focus()}
        style={{ maxHeight: '7rem', overflowY: 'auto' }}
      >
        {value.map((tag, idx) => (
          <span
            key={tag.nameKey}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-tight ${chipColor(idx)}`}
          >
            {tag.name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag.nameKey);
              }}
              className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full opacity-60 hover:opacity-100 transition-opacity"
              aria-label={`Remove ${tag.name}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setDropdownOpen(true);
          }}
          onFocus={() => setDropdownOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={creating}
          className="min-w-[8rem] flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
          autoComplete="off"
        />

        {creating && (
          <span className="self-center text-xs text-gray-400 animate-pulse">Creating…</span>
        )}
      </div>

      {/* Autocomplete dropdown */}
      {dropdownOpen && (filtered.length > 0 || showCreate) && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {filtered.map((tag) => (
            <button
              key={tag.nameKey}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur
                addTag(tag);
              }}
              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-gray-800 hover:bg-blue-50 transition-colors"
            >
              <span className="flex-1 truncate">{tag.name}</span>
              {tag.category && (
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                  {tag.category}
                </span>
              )}
            </button>
          ))}

          {showCreate && (
            <>
              {filtered.length > 0 && <div className="mx-3 border-t border-gray-100" />}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void commitText(inputText);
                }}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Create <strong>&ldquo;{inputText.trim()}&rdquo;</strong>
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
