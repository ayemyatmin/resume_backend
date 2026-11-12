const mockSend = jest.fn();

jest.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: jest.fn(() => ({ send: mockSend })),
  SendEmailCommand: jest.fn((input) => ({ input }))
}));

const { SendEmailCommand } = require("@aws-sdk/client-sesv2");
const { handler } = require("./index");

const validSubmission = {
  name: "Aye Example",
  email: "visitor@example.com",
  phone: "+61 400 123 456",
  message: "I would like to know more."
};

function createEvent(body, method = "POST", origin = "https://ayemyatmin.com") {
  return {
    httpMethod: method,
    headers: origin ? { origin } : {},
    body: typeof body === "string" ? body : JSON.stringify(body)
  };
}

describe("Contact Lambda", () => {
  beforeEach(() => {
    mockSend.mockReset();
    SendEmailCommand.mockClear();
    process.env.CONTACT_SENDER_EMAIL = "verified@example.com";
    process.env.CONTACT_RECIPIENT_EMAIL = "owner@example.com";
    process.env.ALLOWED_ORIGINS = "https://ayemyatmin.com,https://www.ayemyatmin.com";
  });

  test("emails the owner and sends a brief visitor confirmation", async () => {
    mockSend.mockResolvedValue({});

    const result = await handler(createEvent(validSubmission));
    const sentMessages = SendEmailCommand.mock.calls.map(([input]) => input);

    expect(result.statusCode).toBe(202);
    expect(result.headers["Access-Control-Allow-Origin"]).toBe("https://ayemyatmin.com");
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(sentMessages[0].Destination.ToAddresses).toEqual(["owner@example.com"]);
    expect(sentMessages[0].ReplyToAddresses).toEqual([validSubmission.email]);
    expect(sentMessages[0].Content.Simple.Body.Text.Data).toContain(validSubmission.message);
    expect(sentMessages[1].Destination.ToAddresses).toEqual([validSubmission.email]);
    expect(sentMessages[1].Content.Simple.Body.Text.Data).not.toContain(validSubmission.message);
  });

  test("accepts a submission without an optional phone number", async () => {
    const submission = { ...validSubmission };
    delete submission.phone;
    mockSend.mockResolvedValue({});

    const result = await handler(createEvent(submission));
    const ownerEmail = SendEmailCommand.mock.calls[0][0];

    expect(result.statusCode).toBe(202);
    expect(ownerEmail.Content.Simple.Body.Text.Data).toContain("Phone: Not provided");
  });

  test.each([
    [{ ...validSubmission, name: "" }, "name"],
    [{ ...validSubmission, email: "not-an-email" }, "email"],
    [{ ...validSubmission, phone: "x".repeat(41) }, "phone"],
    [{ ...validSubmission, message: "x".repeat(5001) }, "message"]
  ])("rejects invalid input without sending email: %s", async (body) => {
    const result = await handler(createEvent(body));

    expect(result.statusCode).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("rejects malformed JSON", async () => {
    const result = await handler(createEvent("{", "POST"));

    expect(result.statusCode).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("returns CORS headers for an allowed preflight request", async () => {
    const result = await handler(createEvent("", "OPTIONS", "https://www.ayemyatmin.com"));

    expect(result.statusCode).toBe(204);
    expect(result.headers["Access-Control-Allow-Origin"]).toBe("https://www.ayemyatmin.com");
    expect(result.headers["Access-Control-Allow-Methods"]).toBe("POST,OPTIONS");
  });

  test("rejects a request from an unapproved origin", async () => {
    const result = await handler(createEvent(validSubmission, "POST", "https://attacker.example"));

    expect(result.statusCode).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("returns a retryable error if either SES send fails", async () => {
    mockSend.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("SES unavailable"));

    const result = await handler(createEvent(validSubmission));

    expect(result.statusCode).toBe(502);
    expect(JSON.parse(result.body).error).toContain("try again");
  });
});