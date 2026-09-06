import { supabase } from "./supabaseClient.js";

function uid() {
  return supabase.auth.getUser().then(({ data }) => data.user?.id);
}

export async function currentUserId() {
  return uid();
}

export const Notes = {
  async list({ area, folderId, search, tag } = {}) {
    let q = supabase.from("notes").select("*, folders(name,color)").order("pinned", { ascending: false }).order("updated_at", { ascending: false });
    if (area) q = q.eq("area", area);
    if (folderId) q = q.eq("folder_id", folderId);
    if (tag) q = q.contains("tags", [tag]);
    if (search) q = q.ilike("title", `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async get(id) {
    const { data, error } = await supabase.from("notes").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  },
  async create(fields) {
    const user_id = await uid();
    const { data, error } = await supabase.from("notes").insert({ user_id, ...fields }).select().single();
    if (error) throw error;
    return data;
  },
  async update(id, fields) {
    const { data, error } = await supabase.from("notes").update(fields).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) throw error;
  },
};

export const Attachments = {
  async list(noteId) {
    const { data, error } = await supabase
      .from("note_attachments")
      .select("*")
      .eq("note_id", noteId)
      .order("created_at");
    if (error) throw error;
    return data;
  },
  async upload(noteId, file) {
    const userId = await uid();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/notes/${noteId}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("files").upload(path, file);
    if (upErr) throw upErr;
    const { data, error } = await supabase
      .from("note_attachments")
      .insert({
        user_id: userId,
        note_id: noteId,
        file_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async getDownloadUrl(path) {
    const { data, error } = await supabase.storage.from("files").createSignedUrl(path, 120);
    if (error) throw error;
    return data.signedUrl;
  },
  async remove(attachment) {
    await supabase.storage.from("files").remove([attachment.file_path]);
    const { error } = await supabase.from("note_attachments").delete().eq("id", attachment.id);
    if (error) throw error;
  },
};

export const Folders = {
  async list(area) {
    let q = supabase.from("folders").select("*").order("sort_order");
    if (area) q = q.eq("area", area);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async create(fields) {
    const user_id = await uid();
    const { data, error } = await supabase.from("folders").insert({ user_id, ...fields }).select().single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    const { error } = await supabase.from("folders").delete().eq("id", id);
    if (error) throw error;
  },
};

export const Todos = {
  async list({ area, done, from, to } = {}) {
    let q = supabase.from("todos").select("*").order("due_date", { ascending: true, nullsFirst: false });
    if (area) q = q.eq("area", area);
    if (done !== undefined) q = q.eq("done", done);
    if (from) q = q.gte("due_date", from);
    if (to) q = q.lte("due_date", to);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async create(fields) {
    const user_id = await uid();
    const { data, error } = await supabase.from("todos").insert({ user_id, ...fields }).select().single();
    if (error) throw error;
    return data;
  },
  async update(id, fields) {
    const { data, error } = await supabase.from("todos").update(fields).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) throw error;
  },
  async toggle(id, done) {
    return this.update(id, { done, completed_at: done ? new Date().toISOString() : null });
  },
};

export const ShoppingItems = {
  async list(listName) {
    let q = supabase.from("shopping_items").select("*").order("checked").order("created_at", { ascending: false });
    if (listName) q = q.eq("list_name", listName);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async create(fields) {
    const user_id = await uid();
    const { data, error } = await supabase.from("shopping_items").insert({ user_id, ...fields }).select().single();
    if (error) throw error;
    return data;
  },
  async update(id, fields) {
    const { data, error } = await supabase.from("shopping_items").update(fields).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    const { error } = await supabase.from("shopping_items").delete().eq("id", id);
    if (error) throw error;
  },
  async clearChecked(listName) {
    let q = supabase.from("shopping_items").delete().eq("checked", true);
    if (listName) q = q.eq("list_name", listName);
    const { error } = await q;
    if (error) throw error;
  },
};

export const Events = {
  async listRange(startIso, endIso) {
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .lte("start_at", endIso)
      .or(`end_at.gte.${startIso},end_at.is.null`)
      .order("start_at");
    if (error) throw error;
    return data;
  },
  async listUpcoming(limit = 5) {
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("start_at", new Date().toISOString())
      .order("start_at")
      .limit(limit);
    if (error) throw error;
    return data;
  },
  async create(fields) {
    const user_id = await uid();
    const { data, error } = await supabase.from("calendar_events").insert({ user_id, ...fields }).select().single();
    if (error) throw error;
    return data;
  },
  async update(id, fields) {
    const { data, error } = await supabase.from("calendar_events").update(fields).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) throw error;
  },
};

export const GymSessions = {
  async list({ from, to } = {}) {
    let q = supabase.from("gym_sessions").select("*").order("session_date", { ascending: false });
    if (from) q = q.gte("session_date", from);
    if (to) q = q.lte("session_date", to);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async create(fields) {
    const user_id = await uid();
    const { data, error } = await supabase.from("gym_sessions").insert({ user_id, ...fields }).select().single();
    if (error) throw error;
    return data;
  },
  async update(id, fields) {
    const { data, error } = await supabase.from("gym_sessions").update(fields).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    const { error } = await supabase.from("gym_sessions").delete().eq("id", id);
    if (error) throw error;
  },
};

export const Recipes = {
  async list(search) {
    let q = supabase.from("recipes").select("*").order("created_at", { ascending: false });
    if (search) q = q.ilike("title", `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async get(id) {
    const { data, error } = await supabase.from("recipes").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  },
  async create(fields) {
    const user_id = await uid();
    const { data, error } = await supabase.from("recipes").insert({ user_id, ...fields }).select().single();
    if (error) throw error;
    return data;
  },
  async update(id, fields) {
    const { data, error } = await supabase.from("recipes").update(fields).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) throw error;
  },
};

export const Meals = {
  async list({ date, from, to } = {}) {
    let q = supabase.from("meals").select("*, recipes(title)").order("meal_date", { ascending: false });
    if (date) q = q.eq("meal_date", date);
    if (from) q = q.gte("meal_date", from);
    if (to) q = q.lte("meal_date", to);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async create(fields) {
    const user_id = await uid();
    const { data, error } = await supabase.from("meals").insert({ user_id, ...fields }).select().single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    const { error } = await supabase.from("meals").delete().eq("id", id);
    if (error) throw error;
  },
};

export const Goals = {
  async list(status) {
    let q = supabase.from("goals").select("*").order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async create(fields) {
    const user_id = await uid();
    const { data, error } = await supabase.from("goals").insert({ user_id, ...fields }).select().single();
    if (error) throw error;
    return data;
  },
  async update(id, fields) {
    const { data, error } = await supabase.from("goals").update(fields).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async remove(id) {
    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) throw error;
  },
};

export const Diary = {
  async list(limit = 60) {
    const { data, error } = await supabase.from("diary_entries").select("*").order("entry_date", { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  },
  async getByDate(date) {
    const { data, error } = await supabase.from("diary_entries").select("*").eq("entry_date", date).maybeSingle();
    if (error) throw error;
    return data;
  },
  async upsert(date, fields) {
    const user_id = await uid();
    const { data, error } = await supabase
      .from("diary_entries")
      .upsert({ user_id, entry_date: date, ...fields }, { onConflict: "user_id,entry_date" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export const Settings = {
  async get() {
    const { data, error } = await supabase.from("settings").select("*").maybeSingle();
    if (error) throw error;
    return data;
  },
  async update(fields) {
    const user_id = await uid();
    const { data, error } = await supabase.from("settings").upsert({ user_id, ...fields }).select().single();
    if (error) throw error;
    return data;
  },
};

export const FlashcardSets = {
  async listWithCards() {
    const { data, error } = await supabase
      .from("flashcard_sets")
      .select("*, flashcards(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async createWithCards(title, noteId, cards) {
    const user_id = await uid();
    const { data: set, error } = await supabase
      .from("flashcard_sets")
      .insert({ user_id, title, note_id: noteId })
      .select()
      .single();
    if (error) throw error;
    const rows = cards.map((c, i) => ({ user_id, set_id: set.id, question: c.question, answer: c.answer, sort_order: i }));
    const { error: e2 } = await supabase.from("flashcards").insert(rows);
    if (e2) throw e2;
    return set;
  },
  async remove(id) {
    const { error } = await supabase.from("flashcard_sets").delete().eq("id", id);
    if (error) throw error;
  },
};

export const Quizzes = {
  async listWithQuestions() {
    const { data, error } = await supabase
      .from("quizzes")
      .select("*, quiz_questions(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async createWithQuestions(title, noteId, questions) {
    const user_id = await uid();
    const { data: quiz, error } = await supabase
      .from("quizzes")
      .insert({ user_id, title, note_id: noteId })
      .select()
      .single();
    if (error) throw error;
    const rows = questions.map((q, i) => ({
      user_id,
      quiz_id: quiz.id,
      question: q.question,
      choices: q.choices,
      correct_index: q.correct_index,
      explanation: q.explanation || null,
      sort_order: i,
    }));
    const { error: e2 } = await supabase.from("quiz_questions").insert(rows);
    if (e2) throw e2;
    return quiz;
  },
  async remove(id) {
    const { error } = await supabase.from("quizzes").delete().eq("id", id);
    if (error) throw error;
  },
};
