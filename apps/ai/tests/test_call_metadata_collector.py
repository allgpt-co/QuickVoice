import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.call_metadata_collector import (
    CallMetadataCollector,
    build_metadata_collection_instructions,
)


class CallMetadataCollectorTests(unittest.TestCase):
    def test_records_extracted_values_against_configured_data_needed(self):
        config = {
            "data_needed": [
                {
                    "id": "customer_name",
                    "type": "text",
                    "name": "Customer name",
                    "description": "Name provided by the caller",
                }
            ]
        }

        collector = CallMetadataCollector(config)
        result = collector.record_extracted_data("customer_name", "Avery Stone")

        self.assertIn("Customer name", result)
        self.assertEqual(
            config["data_extracted"],
            [
                {
                    "type": "text",
                    "name": "Customer name",
                    "description": "Name provided by the caller",
                    "value": "Avery Stone",
                }
            ],
        )

    def test_records_evaluation_results_separately_from_evaluation_definitions(self):
        config = {
            "data_evaluation": [
                {
                    "id": "qualified",
                    "name": "Qualified lead",
                    "criteria": "Caller wants a demo",
                }
            ]
        }

        collector = CallMetadataCollector(config)
        collector.record_evaluation("qualified", True)

        self.assertEqual(
            config["data_evaluated"],
            [
                {
                    "identifier": "qualified",
                    "description": "Caller wants a demo",
                    "value": True,
                }
            ],
        )
        self.assertEqual(config["data_evaluation"][0]["criteria"], "Caller wants a demo")

    def test_rejects_unknown_targets_and_invalid_typed_values(self):
        config = {
            "data_needed": [
                {"id": "age", "name": "Age", "type": "number"},
                {"id": "start", "name": "Start", "type": "date"},
                {"id": "plan", "name": "Plan", "type": "choice", "options": ["Basic", "Pro"]},
            ],
            "data_evaluation": [{"id": "qualified", "name": "Qualified"}],
        }
        collector = CallMetadataCollector(config)
        self.assertIn("Unknown", collector.record_extracted_data("secret", "value"))
        self.assertIn("Unknown", collector.record_evaluation("secret", True))
        self.assertIn("provide a number", collector.record_extracted_data("age", "not a number"))
        self.assertIn("YYYY-MM-DD", collector.record_extracted_data("start", "tomorrow"))
        self.assertIn("configured option", collector.record_extracted_data("plan", "Premium"))
        self.assertEqual(config["data_extracted"], [])
        self.assertEqual(config["data_evaluated"], [])

        collector.record_extracted_data("age", "42")
        collector.record_extracted_data("start", "2026-10-13")
        collector.record_extracted_data("plan", "pro")
        self.assertEqual([item["value"] for item in config["data_extracted"]], [42, "2026-10-13", "Pro"])

    def test_legacy_choice_without_options_keeps_free_text_behavior(self):
        config = {"data_needed": [{"id": "plan", "name": "Plan", "type": "choice"}]}
        collector = CallMetadataCollector(config)
        self.assertIn("Recorded", collector.record_extracted_data("plan", " Custom "))
        self.assertEqual(config["data_extracted"][0]["value"], "Custom")

    def test_build_metadata_collection_instructions_lists_configured_targets(self):
        instructions = build_metadata_collection_instructions(
            {
                "data_needed": [
                    {
                        "id": "customer_name",
                        "type": "text",
                        "name": "Customer name",
                        "description": "Name provided by the caller",
                    }
                ],
                "data_evaluation": [
                    {
                        "id": "qualified",
                        "name": "Qualified lead",
                        "criteria": "Caller wants a demo",
                    }
                ],
            }
        )

        self.assertIn("record_call_extracted_data", instructions)
        self.assertIn("customer_name", instructions)
        self.assertIn("record_call_evaluation", instructions)
        self.assertIn("qualified", instructions)


if __name__ == "__main__":
    unittest.main()
