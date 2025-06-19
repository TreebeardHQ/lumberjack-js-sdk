async function getData() {
  console.log('Fetching data on server');
  return { message: 'Server data' };
}

export default async function ServerComponent() {
  const data = await getData();
  
  return (
    <div>
      <h2>Server Component</h2>
      <p>{data.message}</p>
    </div>
  );
}