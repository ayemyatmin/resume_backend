export async function handler(event) {
  // Your Lambda function logic here

  const response = {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
    message: "Hello from Lambda!"
  })
};

return response;
}