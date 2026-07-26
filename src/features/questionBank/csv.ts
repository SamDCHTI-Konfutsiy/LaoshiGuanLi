import { buildCsv, parseCsv } from '@/utils/csv';
import { QUESTION_CATEGORIES, QUESTION_DIFFICULTIES, QUESTION_TYPES } from '@/types/enums';
import type { QuestionCategory, QuestionDifficulty, QuestionType } from '@/types/enums';
import type { BankQuestion, QuestionOption, WithId } from '@/types/models';
import type { BankQuestionInput } from '@/features/questionBank/service';

const HEADERS = ['type', 'category', 'difficulty', 'prompt', 'options', 'correctOptions', 'correctText', 'referenceAnswer', 'points', 'tags'];

export function questionsToCsv(questions: WithId<BankQuestion>[]): string {
  const rows = questions.map((q) => {
    const correctTexts = q.options.filter((o) => q.correctOptionIds.includes(o.id)).map((o) => o.text);
    return [
      q.type,
      q.category,
      q.difficulty,
      q.prompt,
      q.options.map((o) => o.text).join('|'),
      correctTexts.join('|'),
      q.correctText,
      q.referenceAnswer,
      String(q.points),
      q.tags.join('|'),
    ];
  });
  return buildCsv(HEADERS, rows);
}

export interface CsvImportResult {
  valid: BankQuestionInput[];
  errors: string[];
}

function optionId(index: number): string {
  return `opt${index}`;
}

export function parseQuestionsCsv(text: string): CsvImportResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { valid: [], errors: ['Empty file.'] };

  const [header, ...dataRows] = rows;
  const col = (name: string) => header!.indexOf(name);
  const idx = {
    type: col('type'),
    category: col('category'),
    difficulty: col('difficulty'),
    prompt: col('prompt'),
    options: col('options'),
    correctOptions: col('correctOptions'),
    correctText: col('correctText'),
    referenceAnswer: col('referenceAnswer'),
    points: col('points'),
    tags: col('tags'),
  };

  if (idx.type === -1 || idx.prompt === -1) {
    return { valid: [], errors: ['Header row must include at least "type" and "prompt" columns.'] };
  }

  const valid: BankQuestionInput[] = [];
  const errors: string[] = [];

  dataRows.forEach((row, i) => {
    const rowNum = i + 2; // +1 for header, +1 for 1-based
    const type = row[idx.type]?.trim() as QuestionType;
    const category = (idx.category >= 0 ? row[idx.category]?.trim() : '') as QuestionCategory;
    const difficulty = (idx.difficulty >= 0 ? row[idx.difficulty]?.trim() : '') as QuestionDifficulty;
    const prompt = row[idx.prompt]?.trim() ?? '';
    const optionTexts = (idx.options >= 0 ? row[idx.options] ?? '' : '').split('|').map((s) => s.trim()).filter(Boolean);
    const correctTexts = new Set(
      (idx.correctOptions >= 0 ? row[idx.correctOptions] ?? '' : '').split('|').map((s) => s.trim()).filter(Boolean),
    );
    const correctText = idx.correctText >= 0 ? (row[idx.correctText]?.trim() ?? '') : '';
    const referenceAnswer = idx.referenceAnswer >= 0 ? (row[idx.referenceAnswer]?.trim() ?? '') : '';
    const points = idx.points >= 0 ? Number(row[idx.points]) : 1;
    const tags = (idx.tags >= 0 ? row[idx.tags] ?? '' : '').split('|').map((s) => s.trim()).filter(Boolean);

    if (!QUESTION_TYPES.includes(type)) {
      errors.push(`Row ${rowNum}: unknown type "${type}".`);
      return;
    }
    if (!prompt) {
      errors.push(`Row ${rowNum}: missing prompt.`);
      return;
    }
    if (!QUESTION_CATEGORIES.includes(category)) {
      errors.push(`Row ${rowNum}: unknown category "${category}".`);
      return;
    }
    if (!QUESTION_DIFFICULTIES.includes(difficulty)) {
      errors.push(`Row ${rowNum}: unknown difficulty "${difficulty}".`);
      return;
    }
    if (!Number.isFinite(points) || points <= 0) {
      errors.push(`Row ${rowNum}: points must be a positive number.`);
      return;
    }

    let options: QuestionOption[] = [];
    let correctOptionIds: string[] = [];

    if (type === 'true_false') {
      options = [
        { id: 'true', text: optionTexts[0] || 'True' },
        { id: 'false', text: optionTexts[1] || 'False' },
      ];
      correctOptionIds = options.filter((o) => correctTexts.has(o.text)).map((o) => o.id);
    } else if (type === 'single_choice' || type === 'multiple_choice') {
      if (optionTexts.length < 2) {
        errors.push(`Row ${rowNum}: ${type} needs at least 2 options (pipe-separated in "options" column).`);
        return;
      }
      options = optionTexts.map((text, oi) => ({ id: optionId(oi), text }));
      correctOptionIds = options.filter((o) => correctTexts.has(o.text)).map((o) => o.id);
      if (correctOptionIds.length === 0) {
        errors.push(`Row ${rowNum}: no option in "correctOptions" matched an option in "options".`);
        return;
      }
    } else if (type === 'fill_blank' && !correctText) {
      errors.push(`Row ${rowNum}: fill_blank needs a "correctText" value.`);
      return;
    }

    valid.push({
      type,
      category,
      difficulty,
      prompt,
      options,
      correctOptionIds,
      correctText,
      referenceAnswer,
      points,
      tags,
    });
  });

  return { valid, errors };
}
