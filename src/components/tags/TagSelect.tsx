import { EntryTag } from "../../lib/commands";
import { Select, type SelectOption } from "../ui/Select";

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
  const options: SelectOption[] = tags.map((tag) => ({
    value: tag.id,
    label: tag.name + (tag.is_archived ? " (Archived)" : ""),
  }));

  return <Select value={value} onChange={onChange} options={options} className={className} />;
}
