import { EntryTag, TimeEntry } from "../../lib/commands";

type TagLike =
  | Pick<EntryTag, "name" | "color">
  | Pick<TimeEntry, "tag_name" | "tag_color">;

function getName(tag: TagLike) {
  return "tag_name" in tag ? tag.tag_name : tag.name;
}

function getColor(tag: TagLike) {
  return "tag_color" in tag ? tag.tag_color : tag.color;
}

export function TagBadge({
  tag,
  className = "",
}: {
  tag: TagLike;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="type-dot" style={{ background: getColor(tag) }} />
      <span className="text-inherit">{getName(tag)}</span>
    </span>
  );
}
