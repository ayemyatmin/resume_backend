// 1. Mock FIRST (before importing anything)
const mockSend = jest.fn();

jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: mockSend
    }))
  },
  UpdateCommand: jest.fn()
}));

// 2. Import AFTER mock
const { handler } = require("./index");

describe("Visitor Counter Lambda", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test("increments visitor count successfully", async () => {
    mockSend.mockResolvedValue({
      Attributes: {
        visitorCount: 42
      }
    });

    const response = await handler({});

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.visitorCount).toBe(42);
  });

  test("returns 500 when DynamoDB fails", async () => {
    mockSend.mockRejectedValue(
      new Error("DynamoDB unavailable")
    );

    const response = await handler({});

    expect(response.statusCode).toBe(500);

    const body = JSON.parse(response.body);
    expect(body.error).toContain("DynamoDB unavailable");
  });
});