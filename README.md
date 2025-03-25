# WhatsApp Bot for Class Coordination

A WhatsApp bot built with Baileys to help coordinate class activities, manage tasks, schedules, lecturer contacts, and send notifications.

## Features

- Task management (view, add, edit, delete, mark as complete)
- Schedule management (view, add, edit, delete)
- Lecturer contact management (view, add, edit, delete)
- Notification system for new tasks and upcoming classes
- Broadcast messages to group members

## Requirements

- Node.js v14+
- MongoDB Atlas account

## Environment Variables

- `MONGO_URI`: MongoDB connection string

## Deployment Instructions

### Local Development

1. Clone this repository
2. Install dependencies: `npm install`
3. Set up environment variables in `.env` file
4. Run the bot: `npm start`

### Deploying to Railway

1. Create a Railway account at [railway.app](https://railway.app/)
2. Install Railway CLI (optional):
   ```
   npm i -g @railway/cli
   ```
3. Login to Railway (if using CLI):
   ```
   railway login
   ```
4. Create a new project in Railway dashboard
5. Connect your GitHub repository or deploy directly:
   - From GitHub: Connect your repository and select it
   - Direct upload: Use `railway up` if using CLI
6. Set up environment variables in Railway dashboard:
   - Add `MONGO_URI` with your MongoDB connection string
7. Deploy the application
8. Once deployed, scan the QR code from the logs to connect your WhatsApp

## Important Notes

- The bot creates an `auth_info` directory to store WhatsApp session data.
- First run will require scanning a QR code to authenticate WhatsApp.
- Railway automatically detects Node.js applications and runs them using the start script.
