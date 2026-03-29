const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

const CAT_MAP = {
  food: '餐飲', transport: '交通', activity: '活動',
  shopping: '購物', tips: '小費', other: '其他',
};
const CAT_REVERSE = Object.fromEntries(Object.entries(CAT_MAP).map(([k, v]) => [v, k]));

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = [
      env.ALLOWED_ORIGIN,
      'https://howt-base.pages.dev',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
    ];
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/expenses' && request.method === 'GET') {
        return await listExpenses(env, corsHeaders);
      }
      if (url.pathname === '/api/expenses' && request.method === 'POST') {
        return await createExpense(request, env, corsHeaders);
      }
      const deleteMatch = url.pathname.match(/^\/api\/expenses\/(.+)$/);
      if (deleteMatch && request.method === 'DELETE') {
        return await deleteExpense(deleteMatch[1], env, corsHeaders);
      }
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
    }
  },
};

async function listExpenses(env, corsHeaders) {
  const results = [];
  let cursor;
  do {
    const body = {
      sorts: [{ property: '日期', direction: 'descending' }],
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`${NOTION_API}/databases/${env.NOTION_DATABASE_ID}/query`, {
      method: 'POST',
      headers: notionHeaders(env),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data.message }, { status: res.status, headers: corsHeaders });
    }
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  const expenses = results.map(item => {
    const p = item.properties;
    const catZh = p['分類']?.select?.name || '';
    return {
      id: item.id,
      amount: p['金額']?.number ?? 0,
      twd: p['TWD']?.number ?? 0,
      rate: p['匯率']?.number ?? 0,
      cat: CAT_REVERSE[catZh] || 'other',
      memo: p['項目']?.title?.[0]?.plain_text || '',
      time: p['日期']?.date?.start || '',
    };
  });

  return Response.json(expenses, { headers: corsHeaders });
}

async function createExpense(request, env, corsHeaders) {
  const body = await request.json();

  const properties = {
    '項目': { title: [{ text: { content: body.memo || '' } }] },
    '金額': { number: body.amount || 0 },
    '分類': { select: { name: CAT_MAP[body.cat] || '其他' } },
  };

  if (body.twd != null) {
    properties['TWD'] = { number: body.twd };
  }
  if (body.rate != null) {
    properties['匯率'] = { number: body.rate };
  }
  if (body.time) {
    properties['日期'] = { date: { start: body.time } };
  }

  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: notionHeaders(env),
    body: JSON.stringify({
      parent: { database_id: env.NOTION_DATABASE_ID },
      properties,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    return Response.json({ error: data.message }, { status: res.status, headers: corsHeaders });
  }

  const p = data.properties;
  const catZh = p['分類']?.select?.name || '';
  const expense = {
    id: data.id,
    amount: p['金額']?.number ?? 0,
    twd: p['TWD']?.number ?? 0,
    rate: p['匯率']?.number ?? 0,
    cat: CAT_REVERSE[catZh] || 'other',
    memo: p['項目']?.title?.[0]?.plain_text || '',
    time: p['日期']?.date?.start || '',
  };

  return Response.json(expense, { status: 201, headers: corsHeaders });
}

async function deleteExpense(pageId, env, corsHeaders) {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: 'PATCH',
    headers: notionHeaders(env),
    body: JSON.stringify({ archived: true }),
  });

  if (!res.ok) {
    const data = await res.json();
    return Response.json({ error: data.message }, { status: res.status, headers: corsHeaders });
  }
  return Response.json({ ok: true }, { headers: corsHeaders });
}

function notionHeaders(env) {
  return {
    'Authorization': `Bearer ${env.NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}
