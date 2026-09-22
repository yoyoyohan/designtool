import { useMemo, useRef, useState } from "react";
import type { TeamRecord } from "../engine/types";
import { LogoCropper } from "./LogoCropper";
import type { DeskMode } from "./logoApi";
import {
  logoIsInUse,
  normalizeLogoName,
  type LogoView,
} from "./logoStore";
import "./LogoDatabase.css";

export type LogoEntry = {
  key: string;
  libraryId: string | null;
  teamId: string | null;
  name: string;
  aliases: string[];
  tags: string[];
  url: string;
  used: boolean;
  source: "library" | "sample";
};

type Props = {
  logos: LogoView[];
  teams: TeamRecord[];
  usedNames: string[];
  note: string;
  shareMode: DeskMode;
  deskOpen: boolean;
  onDeskOpen: () => void;
  onDeskClose: () => void;
  onUnlock: (key: string) => void;
  onUpload: (files: FileList | File[]) => void;
  onSaveMeta: (entry: LogoEntry, name: string, aliases: string, tags: string) => void;
  onReplace: (entry: LogoEntry, file: File) => void;
  onCrop: (entry: LogoEntry, blob: Blob) => void;
  onDelete: (entry: LogoEntry) => void;
};

function buildEntries(logos: LogoView[], teams: TeamRecord[], usedNames: string[]): LogoEntry[] {
  const covered = new Set<string>();
  const rows: LogoEntry[] = logos.map((logo) => {
    teams.forEach((team) => {
      const names = [team.name, team.logoFile.replace(/\.[^.]+$/, ""), ...team.aliases].map(normalizeLogoName);
      if ([logo.name, ...logo.aliases].map(normalizeLogoName).some((key) => names.includes(key))) {
        covered.add(team.id);
      }
    });
    return {
      key: `lib-${logo.id}`,
      libraryId: logo.id,
      teamId: null,
      name: logo.name,
      aliases: logo.aliases,
      tags: logo.tags,
      url: logo.url,
      used: logoIsInUse(logo, usedNames),
      source: "library",
    };
  });
  for (const team of teams) {
    if (covered.has(team.id) || !team.logoUrl) continue;
    rows.push({
      key: `team-${team.id}`,
      libraryId: null,
      teamId: team.id,
      name: team.name,
      aliases: team.aliases,
      tags: team.source === "sample" ? ["Sample"] : ["Upload"],
      url: team.logoUrl,
      used: usedNames.some((query) => normalizeLogoName(query) === normalizeLogoName(team.name)),
      source: "sample",
    });
  }
  return rows.sort((a, b) => {
    if (a.used !== b.used) return a.used ? -1 : 1;
    if (a.source !== b.source) return a.source === "library" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function filterEntries(rows: LogoEntry[], query: string, tag: string): LogoEntry[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (tag && !row.tags.includes(tag)) return false;
    if (!needle) return true;
    return (
      row.name.toLowerCase().includes(needle) ||
      row.aliases.some((alias) => alias.toLowerCase().includes(needle)) ||
      row.tags.some((item) => item.toLowerCase().includes(needle))
    );
  });
}

function LogoRow({
  entry,
  onSaveMeta,
  onCrop,
  onReplaceClick,
  onDelete,
}: {
  entry: LogoEntry;
  onSaveMeta: Props["onSaveMeta"];
  onCrop: (entry: LogoEntry) => void;
  onReplaceClick: (entry: LogoEntry) => void;
  onDelete: Props["onDelete"];
}) {
  return (
    <article className={entry.used ? "logo-row is-used" : "logo-row"}>
      <button type="button" className="logo-row-mark" title="Crop crest" onClick={() => onCrop(entry)}>
        <img src={entry.url} alt="" />
      </button>
      <label>
        School
        <input
          key={`${entry.key}-name-${entry.name}`}
          defaultValue={entry.name}
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (next && next !== entry.name) onSaveMeta(entry, next, entry.aliases.join(", "), entry.tags.join(", "));
          }}
        />
      </label>
      <label>
        Also known as
        <input
          key={`${entry.key}-aka-${entry.aliases.join("|")}`}
          defaultValue={entry.aliases.join(", ")}
          placeholder="Short names, nicknames"
          onBlur={(event) => {
            if (event.target.value !== entry.aliases.join(", ")) {
              onSaveMeta(entry, entry.name, event.target.value, entry.tags.join(", "));
            }
          }}
        />
      </label>
      <label>
        Tags
        <input
          key={`${entry.key}-tags-${entry.tags.join("|")}`}
          defaultValue={entry.tags.filter((tag) => tag !== "Sample" && tag !== "Upload").join(", ")}
          placeholder="State, Movers"
          onBlur={(event) => {
            if (event.target.value !== entry.tags.filter((tag) => tag !== "Sample" && tag !== "Upload").join(", ")) {
              onSaveMeta(entry, entry.name, entry.aliases.join(", "), event.target.value);
            }
          }}
        />
      </label>
      <div className="logo-row-side">
        <span>{entry.used ? "On this poster" : entry.source === "library" ? "Library" : "Sample pack"}</span>
        <div className="logo-db-actions">
          <button type="button" className="link-btn" onClick={() => onCrop(entry)}>
            Crop
          </button>
          <button type="button" className="link-btn" onClick={() => onReplaceClick(entry)}>
            Replace
          </button>
          {entry.libraryId ? (
            <button type="button" className="link-btn" onClick={() => onDelete(entry)}>
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function LogoDatabase({
  logos,
  teams,
  usedNames,
  note,
  shareMode,
  deskOpen,
  onDeskOpen,
  onDeskClose,
  onUnlock,
  onUpload,
  onSaveMeta,
  onReplace,
  onCrop,
  onDelete,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const pendingReplace = useRef<LogoEntry | null>(null);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [deskKey, setDeskKeyDraft] = useState("");
  const [cropping, setCropping] = useState<LogoEntry | null>(null);
  const [dropHot, setDropHot] = useState(false);

  const entries = useMemo(() => buildEntries(logos, teams, usedNames), [logos, teams, usedNames]);
  const shown = useMemo(() => filterEntries(entries, query, tag), [entries, query, tag]);
  const tags = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((entry) => entry.tags.forEach((item) => set.add(item)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [entries]);
  const posterCount = entries.filter((entry) => entry.used).length;

  function askDelete(entry: LogoEntry) {
    if (!entry.libraryId) return;
    const ok = window.confirm(
      entry.used
        ? `${entry.name} is on this week's poster. Delete the library crest? The sample mark comes back if one exists.`
        : `Delete ${entry.name} from the library?`,
    );
    if (ok) onDelete(entry);
  }

  const tools = (
    <>
      <p className={`logo-share is-${shareMode}`}>
        {shareMode === "shared"
          ? "Shared with sports business. Leave the page — the crest stays for everyone."
          : shareMode === "locked"
            ? "Everyone can see the shared desk. The key is required to replace a crest for the group."
            : "Saved on this computer only. Add the Supabase keys on Render to share with the desk."}
      </p>
      {shareMode === "locked" ? (
        <form
          className="logo-key-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (deskKey.trim()) onUnlock(deskKey.trim());
          }}
        >
          <input
            type="password"
            value={deskKey}
            placeholder="Sports business desk key"
            autoComplete="off"
            onChange={(event) => setDeskKeyDraft(event.target.value)}
          />
          <button type="submit" className="ghost-btn">
            Unlock
          </button>
        </form>
      ) : null}
      <div
        className={dropHot ? "dropzone is-hot" : "dropzone"}
        onDragOver={(event) => {
          event.preventDefault();
          setDropHot(true);
        }}
        onDragLeave={() => setDropHot(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDropHot(false);
          if (event.dataTransfer.files.length) onUpload(event.dataTransfer.files);
        }}
      >
        Drop crests here. Click a name to rename. Crop or replace saves over the same school.
      </div>
      <div className="row-btns">
        <button type="button" className="ghost-btn" onClick={() => fileRef.current?.click()}>
          Upload logos
        </button>
        {!deskOpen ? (
          <button type="button" className="ghost-btn" onClick={onDeskOpen}>
            Open full library
          </button>
        ) : null}
      </div>
      <p className="pack-meta">
        {note}
        {posterCount ? ` · ${posterCount} on this poster` : ""}
      </p>
      <div className="logo-db-tools">
        <input
          type="search"
          value={query}
          placeholder="Search school, nickname, or tag…"
          onChange={(event) => setQuery(event.target.value)}
        />
        {tags.length > 0 ? (
          <select value={tag} onChange={(event) => setTag(event.target.value)} aria-label="Filter by tag">
            <option value="">All logos</option>
            {tags.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </>
  );

  const files = (
    <>
      <input
        ref={fileRef}
        className="hidden-file"
        type="file"
        multiple
        accept="image/png,image/svg+xml,image/jpeg,image/webp"
        onChange={(event) => {
          if (event.target.files?.length) onUpload(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={replaceRef}
        className="hidden-file"
        type="file"
        accept="image/png,image/svg+xml,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const entry = pendingReplace.current;
          pendingReplace.current = null;
          if (file && entry) onReplace(entry, file);
          event.target.value = "";
        }}
      />
    </>
  );

  const list = (rows: LogoEntry[]) =>
    rows.map((entry) => (
      <LogoRow
        key={entry.key}
        entry={entry}
        onSaveMeta={onSaveMeta}
        onCrop={setCropping}
        onReplaceClick={(item) => {
          pendingReplace.current = item;
          replaceRef.current?.click();
        }}
        onDelete={askDelete}
      />
    ));

  const panelRows = shown.slice(0, 8);

  return (
    <div className="logo-db">
      {deskOpen ? null : tools}
      {files}
      {deskOpen ? null : (
        <>
          <div className="logo-row-list">{list(panelRows)}</div>
          {shown.length > panelRows.length ? (
            <button type="button" className="ghost-btn logo-db-more" onClick={onDeskOpen}>
              See all {shown.length} logos
            </button>
          ) : null}
        </>
      )}
      {deskOpen ? (
        <div className="logo-desk" role="dialog" aria-modal="true" aria-label="Logo library">
          <div className="logo-desk-bar">
            <div>
              <h2>Logo library</h2>
              <p>
                {shareMode === "shared"
                  ? "Edits save for the whole desk. Click a field, then leave the box."
                  : "Click a field to edit. Changes save when you leave the box."}
              </p>
            </div>
            <button type="button" className="ghost-btn" onClick={onDeskClose}>
              Close
            </button>
          </div>
          <div className="logo-desk-body">
            {tools}
            <div className="logo-row-list is-desk">{list(shown)}</div>
          </div>
        </div>
      ) : null}
      {cropping ? (
        <LogoCropper
          src={cropping.url}
          name={cropping.name}
          onCancel={() => setCropping(null)}
          onApply={(blob) => {
            onCrop(cropping, blob);
            setCropping(null);
          }}
        />
      ) : null}
    </div>
  );
}
