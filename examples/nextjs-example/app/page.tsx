import ServerComponent from "./server-component";

export default function Home() {
  return (
    <div>
      <h1>Lumberjack Next.js Example</h1>
      <ServerComponent />
      <div>
        <h2>Client Component</h2>
        <p>This is rendered on the client</p>
      </div>
    </div>
  );
}
