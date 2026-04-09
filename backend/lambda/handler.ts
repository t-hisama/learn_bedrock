import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify(body),
});

export const main = async (event: any) => {
  const tableName = process.env.TABLE_NAME;

  if (!tableName) {
    return json(500, { message: 'TABLE_NAME is not set' });
  }

  const method = event?.httpMethod;
  const path = event?.path;
  const pathParameters = event?.pathParameters;

  if (method === 'GET' && path === '/todos') {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
      })
    );

    return json(200, {
      items: result.Items ?? [],
    });
  }

  if (method === 'POST' && path === '/todos') {
    const parsedBody = event?.body ? JSON.parse(event.body) : {};
    const title = parsedBody?.title;

    if (!title || typeof title !== 'string') {
      return json(400, { message: 'title is required' });
    }

    const item = {
      id: randomUUID(),
      title,
      createdAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      })
    );

    return json(201, item);
  }

  if (method === 'DELETE' && pathParameters?.proxy) {
    const rawPath = pathParameters.proxy;
    const match = rawPath.match(/^todos\/(.+)$/);

    if (!match) {
      return json(404, { message: 'Not Found', method, path });
    }

    const id = match[1];

    await docClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { id },
      })
    );

    return json(200, {
      message: 'deleted',
      id,
    });
  }

  return json(404, {
    message: 'Not Found',
    method,
    path,
  });
};