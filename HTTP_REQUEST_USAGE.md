# Using TickTick Session API with HTTP Request Node

The TickTick Session API credentials can now be used with n8n's HTTP Request node to make custom API calls to TickTick's undocumented V2 API.

## Setup

1. **Create TickTick Session API Credentials**
   - In n8n, go to Credentials
   - Click "Add Credential"
   - Search for "TickTick (V2) Session API"
   - Enter your TickTick email and password
   - Save the credentials

2. **Use with HTTP Request Node**
   - Add an HTTP Request node to your workflow
   - Set the Authentication method to "Predefined Credential Type"
   - Select "TickTick (V2) Session API" from the dropdown
   - Choose your saved credentials

## Making Requests

### Base URL
All V2 API endpoints start with: `https://api.ticktick.com/api/v2`

### Example Requests

#### Get User Profile
```
Method: GET
URL: https://api.ticktick.com/api/v2/user/profile
```

#### Get All Tasks
```
Method: GET
URL: https://api.ticktick.com/api/v2/batch/check/0
```

#### Create a Task
```
Method: POST
URL: https://api.ticktick.com/api/v2/task
Body: JSON
{
  "title": "New Task",
  "projectId": "inbox123456"
}
```

## How It Works

The credential type automatically:
1. Authenticates with your email/password on first use
2. Obtains a session token
3. Caches the token for 23 hours
4. Adds required headers to all HTTP requests:
   - `Cookie: t={sessionToken}`
   - `X-Device: {device info}`
   - `User-Agent: Mozilla/5.0...`

## Limitations

- **Two-Factor Authentication (2FA)**: Not supported. You must disable 2FA on your TickTick account to use session authentication.
- **Session Duration**: Sessions expire after 23 hours and are automatically renewed on the next request.
- **Credential Testing**: The "Test" button in credentials will not work properly due to the complex session management. Validation happens when you use the credentials in a workflow.

## Troubleshooting

If you get authentication errors:
1. Verify your email and password are correct
2. Ensure 2FA is disabled on your TickTick account
3. Check that you're using the correct API endpoint (V2 URLs)
4. If issues persist, delete and recreate the credentials to clear the session cache
