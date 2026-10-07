import StatusTable from './StatusTable';

export default function DroneTelemetry({ drone }) {
  return (
    <StatusTable
      title="DRONE"
      tag={drone.id}
      rows={[
        { label: 'BATTERY', value: `${drone.battery}%` },
        { label: 'GPS', value: drone.gps, dot: true },
        { label: 'LINK', value: drone.link, dot: true },
        { label: 'STATUS', value: drone.status, dot: true },
        { label: 'FLIGHT', value: drone.flight, dot: true },
      ]}
    />
  );
}
