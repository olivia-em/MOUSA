# Results Directory

This directory contains JSON files with translation results and metadata.

## Usage

- Translation results are automatically saved here as JSON files
- Each result file contains the original text, translated text, and metadata
- Files are timestamped for easy organization

## File Format

JSON files with the following structure:

```json
{
  "id": "unique_translation_id",
  "timestamp": "2025-10-07T12:00:00.000Z",
  "source": {
    "text": "Original text",
    "language": "en",
    "detected_language": "en"
  },
  "target": {
    "text": "Translated text",
    "language": "es"
  },
  "metadata": {
    "translation_engine": "translator_name",
    "confidence": 0.95,
    "processing_time": 1.2
  }
}
```

## File Naming

- Format: `translation_YYYYMMDD_HHMMSS_ID.json`
- Example: `translation_20251007_120000_abc123.json`

Results are automatically generated when translations are processed through the system.
