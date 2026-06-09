const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  try {
    const command = new UpdateCommand({
      TableName: "Visitor",
      Key: {
        statId: "visitorCount"
      },
      UpdateExpression: "ADD visitorCount :inc",
      ExpressionAttributeValues: {
        ":inc": 1
      },
      ReturnValues: "ALL_NEW"
    });

    const result = await docClient.send(command);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        visitorCount: result.Attributes.visitorCount
      })
    };

  } catch (error) {
    console.error("Error updating visitor count:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};