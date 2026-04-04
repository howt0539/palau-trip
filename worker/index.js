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
      if (url.pathname === '/api/trips' && request.method === 'GET') {
        return await listTrips(env, corsHeaders);
      }
      if (url.pathname === '/api/trips' && request.method === 'POST') {
        return await createTrip(request, env, corsHeaders);
      }
      const deleteTripMatch = url.pathname.match(/^\/api\/trips\/(.+)$/);
      if (deleteTripMatch && request.method === 'DELETE') {
        return await deleteTrip(deleteTripMatch[1], env, corsHeaders);
      }
      // Photos KV
      const photoMatch = url.pathname.match(/^\/api\/photos\/(.+)$/);
      if (photoMatch && request.method === 'GET') {
        return await getPhoto(photoMatch[1], env, corsHeaders);
      }
      if (url.pathname === '/api/photos' && request.method === 'POST') {
        return await uploadPhoto(request, env, corsHeaders);
      }
      if (url.pathname === '/api/photos/batch' && request.method === 'POST') {
        return await batchGetPhotos(request, env, corsHeaders);
      }
      if (photoMatch && request.method === 'DELETE') {
        return await deletePhoto(photoMatch[1], env, corsHeaders);
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

// ===== Trips =====

async function listTrips(env, corsHeaders) {
  const results = [];
  let cursor;
  do {
    const body = {
      sorts: [{ property: '時間', direction: 'descending' }],
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`${NOTION_API}/databases/${env.NOTION_TRIPS_DB_ID}/query`, {
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

  const trips = results.map(item => {
    const p = item.properties;
    return {
      id: item.id,
      place: p['地點']?.title?.[0]?.plain_text || '',
      time: p['時間']?.date?.start || '',
      note: p['備註']?.rich_text?.[0]?.plain_text || '',
      photoKeys: p['照片']?.rich_text?.[0]?.plain_text || '',
    };
  });

  return Response.json(trips, { headers: corsHeaders });
}

async function createTrip(request, env, corsHeaders) {
  const body = await request.json();

  const properties = {
    '地點': { title: [{ text: { content: body.place || '' } }] },
  };
  if (body.time) {
    properties['時間'] = { date: { start: body.time } };
  }
  if (body.note) {
    properties['備註'] = { rich_text: [{ text: { content: body.note } }] };
  }
  if (body.photoKeys) {
    properties['照片'] = { rich_text: [{ text: { content: body.photoKeys } }] };
  }

  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: notionHeaders(env),
    body: JSON.stringify({
      parent: { database_id: env.NOTION_TRIPS_DB_ID },
      properties,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    return Response.json({ error: data.message }, { status: res.status, headers: corsHeaders });
  }

  const p = data.properties;
  const trip = {
    id: data.id,
    place: p['地點']?.title?.[0]?.plain_text || '',
    time: p['時間']?.date?.start || '',
    note: p['備註']?.rich_text?.[0]?.plain_text || '',
    photoKeys: p['照片']?.rich_text?.[0]?.plain_text || '',
  };

  return Response.json(trip, { status: 201, headers: corsHeaders });
}

async function deleteTrip(pageId, env, corsHeaders) {
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

// ===== Photos KV =====

async function getPhoto(key, env, corsHeaders) {
  const data = await env.PHOTOS.get(key);
  if (!data) {
    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  }
  return Response.json({ key, data }, { headers: corsHeaders });
}

async function uploadPhoto(request, env, corsHeaders) {
  const body = await request.json();
  // body: { key: 'trip-xxx-0' or 'fish-clownfish', data: 'data:image/jpeg;base64,...' }
  if (!body.key || !body.data) {
    return Response.json({ error: 'key and data required' }, { status: 400, headers: corsHeaders });
  }
  await env.PHOTOS.put(body.key, body.data);
  return Response.json({ key: body.key }, { status: 201, headers: corsHeaders });
}

async function batchGetPhotos(request, env, corsHeaders) {
  const body = await request.json();
  // body: { keys: ['trip-xxx-0', 'fish-clownfish', ...] }
  if (!body.keys || !Array.isArray(body.keys)) {
    return Response.json({ error: 'keys array required' }, { status: 400, headers: corsHeaders });
  }
  const results = await getPhotos(body.keys, env);
  return Response.json(results, { headers: corsHeaders });
}

async function deletePhoto(key, env, corsHeaders) {
  await env.PHOTOS.delete(key);
  return Response.json({ ok: true }, { headers: corsHeaders });
}

// Batch get multiple photos
async function getPhotos(keys, env) {
  const results = {};
  await Promise.all(keys.map(async (key) => {
    const data = await env.PHOTOS.get(key);
    if (data) results[key] = data;
  }));
  return results;
}

function notionHeaders(env) {
  return {
    'Authorization': `Bearer ${env.NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}
