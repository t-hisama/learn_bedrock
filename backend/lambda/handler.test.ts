/**
 * Lambda ハンドラーのユニットテスト
 * aws-sdk-client-mock を使用してDynamoDB呼び出しをモックする
 */

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { main } from './handler';

// DynamoDBDocumentClient をモック化
const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  process.env.TABLE_NAME = 'test-todo-table';
});

afterEach(() => {
  delete process.env.TABLE_NAME;
});

describe('GET /todos', () => {
  test('空のリストを返す', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });

    const result = await main({ httpMethod: 'GET', path: '/todos' });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toEqual([]);
  });

  test('Todoリストを返す', async () => {
    const mockItems = [
      { id: 'abc-123', title: 'テストTodo', createdAt: '2024-01-01T00:00:00.000Z' },
    ];
    ddbMock.on(ScanCommand).resolves({ Items: mockItems });

    const result = await main({ httpMethod: 'GET', path: '/todos' });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe('テストTodo');
  });

  test('TABLE_NAME未設定時に500を返す', async () => {
    delete process.env.TABLE_NAME;

    const result = await main({ httpMethod: 'GET', path: '/todos' });

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('TABLE_NAME is not set');
  });
});

describe('POST /todos', () => {
  test('Todoを作成して201を返す', async () => {
    ddbMock.on(PutCommand).resolves({});

    const result = await main({
      httpMethod: 'POST',
      path: '/todos',
      body: JSON.stringify({ title: '新しいTodo' }),
    });

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.title).toBe('新しいTodo');
    expect(body.id).toBeDefined();
    expect(body.createdAt).toBeDefined();
  });

  test('titleなしで400を返す', async () => {
    const result = await main({
      httpMethod: 'POST',
      path: '/todos',
      body: JSON.stringify({}),
    });

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('title is required');
  });

  test('titleが文字列以外で400を返す', async () => {
    const result = await main({
      httpMethod: 'POST',
      path: '/todos',
      body: JSON.stringify({ title: 123 }),
    });

    expect(result.statusCode).toBe(400);
  });
});

describe('DELETE /todos/:id', () => {
  test('Todoを削除して200を返す', async () => {
    ddbMock.on(DeleteCommand).resolves({});

    const result = await main({
      httpMethod: 'DELETE',
      path: '/todos/test-id-123',
      pathParameters: { proxy: 'todos/test-id-123' },
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('deleted');
    expect(body.id).toBe('test-id-123');
  });

  test('不正なパスで404を返す', async () => {
    const result = await main({
      httpMethod: 'DELETE',
      path: '/invalid-path',
      pathParameters: { proxy: 'invalid-path' },
    });

    expect(result.statusCode).toBe(404);
  });
});

describe('不明なルート', () => {
  test('未定義のルートで404を返す', async () => {
    const result = await main({ httpMethod: 'GET', path: '/unknown' });

    expect(result.statusCode).toBe(404);
  });
});
