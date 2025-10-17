type Props = { label: string; value: string; hint?: string };
export default function KpiTile({ label, value, hint }: Props) {
  return (
    <div className="card kpi shadow-sm">
      <div className="card-body">
        <div className="lead">{value}</div>
        <div className="text-muted">{label}</div>
        {hint && <div className="small text-secondary mt-1">{hint}</div>}
      </div>
    </div>
  );
}