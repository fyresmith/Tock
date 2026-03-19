import { EntryTag } from "../../lib/commands";

export function getSelectableTags(tags: EntryTag[], currentTagId?: string | null) {
  return tags.filter((tag) => !tag.is_archived || tag.id === currentTagId);
}

export function TagSelect({
  tags,
  value,
  onChange,
  className,
}: {
  tags: EntryTag[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      {tags.map((tag) => (
        <option key={tag.id} value={tag.id}>
          {tag.name}{tag.is_archived ? " (Archived)" : ""}
        </option>
      ))}
    </select>
  );
}
