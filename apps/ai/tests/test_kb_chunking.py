import os
import re
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.kb_chunking import chunk_text, get_tokenizer


class KbChunkingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tokenizer = get_tokenizer()

    def tokens(self, text):
        return self.tokenizer.encode(text, add_special_tokens=False).ids

    def assert_fits(self, chunks, size=220, model_limit=256):
        self.assertTrue(chunks)
        for chunk in chunks:
            self.assertTrue(chunk.strip())
            self.assertLessEqual(len(self.tokens(chunk)), size)
            self.assertLessEqual(len(self.tokenizer.encode(chunk).ids), model_limit)

    def test_tokenizer_does_not_silently_truncate_or_pad(self):
        self.assertEqual(len(self.tokens("hello " * 300)), 300)
        self.assertEqual(len(self.tokenizer.encode("hello " * 300).ids), 302)
        self.assertIsNone(self.tokenizer.truncation)
        self.assertIsNone(self.tokenizer.padding)

    def test_blank_and_tokenless_input_produces_no_chunks(self):
        for text in ("", " \n\t ", "\x00"):
            with self.subTest(text=text):
                self.assertEqual(chunk_text(text), [])

    def test_short_text_preserves_original_case_unicode_and_formatting(self):
        text = "  Café — PRICES:\nRésumé\t£25.00\nCafe\u0301 costs €10.  "
        self.assertEqual(chunk_text(text), [text.strip()])

    def test_packs_whole_sentences_and_repeats_whole_sentence_when_it_fits(self):
        sentences = ["One short sentence.", "Two short sentences.", "Three short sentences."]
        size = len(self.tokens(" ".join(sentences[:2])))
        overlap = len(self.tokens(sentences[1]))
        chunks = chunk_text(" ".join(sentences), size=size, overlap=overlap)
        self.assertEqual(chunks, [" ".join(sentences[:2]), " ".join(sentences[1:])])

    def test_respects_line_and_closing_quote_boundaries(self):
        for text, first in (
            ("First heading\nFirst paragraph has facts\nLast paragraph has details", "First heading\nFirst paragraph has facts"),
            ('She said "Welcome." He said "Hello." Then we left.', 'She said "Welcome." He said "Hello."'),
        ):
            with self.subTest(text=text):
                size = len(self.tokens(first)) + 1
                chunks = chunk_text(text, size=size, overlap=0)
                self.assertEqual(chunks[0], first)
                self.assert_fits(chunks, size=size)

    def test_long_sentence_has_32_token_overlap_and_no_missing_tail(self):
        text = " ".join(["hello", "world", "house", "garden", "river", "mountain"] * 100)
        chunks = chunk_text(text)
        self.assert_fits(chunks)
        self.assertEqual(len(self.tokens(chunks[0])), 220)
        reconstructed = self.tokens(chunks[0])
        for previous, current in zip(chunks, chunks[1:]):
            self.assertEqual(self.tokens(previous)[-32:], self.tokens(current)[:32])
            reconstructed.extend(self.tokens(current)[32:])
        self.assertEqual(reconstructed, self.tokens(text))

    def test_exact_budget_does_not_create_an_overlap_only_chunk(self):
        text = "hello " * 220
        self.assertEqual(chunk_text(text), [text.strip()])

    def test_default_budget_includes_overlap(self):
        chunks = chunk_text("knowledge " * 1000)
        self.assertGreater(len(chunks), 1)
        self.assert_fits(chunks)
        self.assertEqual(len(self.tokens(chunks[1])), 220)

    def test_special_tokens_reduce_the_maximum_content_budget(self):
        chunks = chunk_text("hello " * 700, size=1000)
        self.assert_fits(chunks, size=254)
        self.assertEqual(len(self.tokenizer.encode(chunks[0]).ids), 256)

    def test_128_token_runtime_caps_default_chunk_size_at_126(self):
        chunks = chunk_text("hello " * 500, max_input_tokens=128)
        self.assert_fits(chunks, size=126, model_limit=128)
        self.assertEqual(len(self.tokenizer.encode(chunks[0]).ids), 128)

    def test_wordpiece_fallback_preserves_original_text_without_decoding(self):
        text = ("Antidisestablishmentarianism Café\u0301 £12.34 東京 XMLHttpRequest! " * 15).strip()
        for size in (1, 3, 7, 16):
            with self.subTest(size=size):
                chunks = chunk_text(text, size=size, overlap=0)
                self.assert_fits(chunks, size=size)
                self.assertEqual(
                    re.sub(r"\s+", "", "".join(chunks)),
                    re.sub(r"\s+", "", text),
                )

    def test_wordpiece_overlap_makes_progress_with_small_budgets(self):
        text = " ".join(["Antidisestablishmentarianism", "XMLHttpRequest", "résumé"] * 20)
        for size, overlap in ((3, 2), (7, 4), (12, 5)):
            with self.subTest(size=size, overlap=overlap):
                chunks = chunk_text(text, size=size, overlap=overlap)
                self.assert_fits(chunks, size=size)
                self.assertTrue(text.endswith(chunks[-1]))
                self.assertLessEqual(len(chunks), len(self.tokens(text)))

    def test_chunks_can_exceed_1000_characters_without_exceeding_token_budget(self):
        chunks = chunk_text("information " * 200)
        self.assertEqual(chunks, [("information " * 200).strip()])
        self.assertGreater(len(chunks[0]), 1000)
        self.assert_fits(chunks)

    def test_unicode_characters_with_multiple_tokens_preserve_content(self):
        text = "한글 안녕하세요 " * 100
        chunks = chunk_text(text, overlap=0)
        self.assert_fits(chunks)
        self.assertEqual("".join(chunks).replace(" ", ""), text.replace(" ", ""))

    def test_budget_too_small_for_one_character_fails_instead_of_looping(self):
        with self.assertRaisesRegex(ValueError, "too small for a source character"):
            chunk_text("한글", size=1, overlap=0)

    def test_rejects_invalid_configuration(self):
        for kwargs in (
            {"size": 0}, {"size": -1}, {"size": 1.5},
            {"overlap": -1}, {"overlap": 220}, {"overlap": 1.5},
            {"max_input_tokens": 2}, {"max_input_tokens": 257},
            {"max_input_tokens": 128, "overlap": 126},
        ):
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(ValueError):
                    chunk_text("test", **kwargs)


if __name__ == "__main__":
    unittest.main()
