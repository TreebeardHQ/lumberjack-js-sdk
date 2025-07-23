async function getData() {
  console.log("Fetching data on server");
  return {
    message: "Server data",
    commit: process.env.LUMBERJACK_COMMIT_SHA || "no commit found",
  };
}

export default async function ServerComponent() {
  const data = await getData();

  return (
    <div>
      <h2>Server Component</h2>
      <p>{data.message}</p>
      <p>{data.commit}</p>
    </div>
  );
}
