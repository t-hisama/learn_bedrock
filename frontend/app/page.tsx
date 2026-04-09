import { revalidatePath } from 'next/cache';

type Todo = {
  id: string;
  title: string;
  createdAt: string;
};

const apiBaseUrl = process.env.API_BASE_URL;

async function fetchTodos(): Promise<Todo[]> {
  if (!apiBaseUrl) {
    throw new Error('API_BASE_URL is not set');
  }

  const res = await fetch(`${apiBaseUrl}/todos`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('failed to fetch todos');
  }

  const data = await res.json();
  return data.items ?? [];
}

async function createTodo(formData: FormData) {
  'use server';

  if (!apiBaseUrl) {
    throw new Error('API_BASE_URL is not set');
  }

  const title = formData.get('title')?.toString().trim();

  if (!title) {
    return;
  }

  const res = await fetch(`${apiBaseUrl}/todos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('failed to create todo');
  }

  revalidatePath('/');
}

async function deleteTodo(formData: FormData) {
  'use server';

  if (!apiBaseUrl) {
    throw new Error('API_BASE_URL is not set');
  }

  const id = formData.get('id')?.toString();

  if (!id) {
    return;
  }

  const res = await fetch(`${apiBaseUrl}/todos/${id}`, {
    method: 'DELETE',
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('failed to delete todo');
  }

  revalidatePath('/');
}

export default async function Page() {
  const todos = await fetchTodos();

  return (
    <main style={{ padding: '24px', maxWidth: '720px', margin: '0 auto' }}>
      <h1>Todo App</h1>

      <form action={createTodo} style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <input
          type="text"
          name="title"
          placeholder="Todo を入力"
          style={{
            flex: 1,
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        />
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            border: '1px solid #333',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          追加
        </button>
      </form>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {todos.map((todo) => (
          <li
            key={todo.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              border: '1px solid #ddd',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '8px',
            }}
          >
            <div>
              <div>{todo.title}</div>
              <small>{todo.createdAt}</small>
            </div>

            <form action={deleteTodo}>
              <input type="hidden" name="id" value={todo.id} />
              <button
                type="submit"
                style={{
                  padding: '6px 12px',
                  border: '1px solid #c00',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                削除
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}