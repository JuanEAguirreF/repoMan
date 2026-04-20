type Props = {
  status: "active" | "pending_deletion" | "deleted";
};

const colorMap = {
  active: "#2d7a2d",
  pending_deletion: "#9a6b00",
  deleted: "#8a1f1f"
};

export function StatusBadge({ status }: Props) {
  return (
    <span
      style={{
        background: colorMap[status],
        color: "white",
        borderRadius: 12,
        padding: "2px 8px",
        fontSize: 12,
        textTransform: "capitalize"
      }}
    >
      {status.replace("_", " ")}
    </span>
  );
}
