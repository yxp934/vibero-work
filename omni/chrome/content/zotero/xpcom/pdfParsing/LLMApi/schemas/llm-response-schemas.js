/**
 * LLM 响应的 JSON Schema 定义（火山引擎 json_schema 严格模式）
 * 与 prompt 中的输出格式要求完全一致
 */

// ArticleSummaryOutput Schema - 论文总结输出
const ArticleSummaryOutputSchema = {
  name: "ArticleSummaryOutput",
  strict: true,
  schema: {
    type: "object",
    properties: {
      github_url: {
        type: "string"
      },
      outline: {
        $ref: "#/definitions/OutlineNode"
      },
      article_summary: {
        type: "array",
        items: {
          $ref: "#/definitions/ArticleSummaryItem"
        },
        minItems: 5,
        maxItems: 5
      }
    },
    required: ["github_url", "outline", "article_summary"],
    definitions: {
      OutlineNode: {
        type: "object",
        properties: {
          title: {
            type: "string",
            minLength: 1
          },
          title_block_id: {
            type: "integer",
            minimum: 0
          },
          level: {
            type: "integer",
            minimum: 0
          },
          summary: {
            type: "string",
            minLength: 5,
            maxLength: 100
          },
          children: {
            type: "array",
            items: {
              $ref: "#/definitions/OutlineNode"
            }
          }
        },
        required: ["title", "title_block_id", "level", "summary", "children"]
      },

      ArticleSummaryItem: {
        type: "object",
        properties: {
          title: {
            type: "string",
            enum: [
            "论文标题",
            "研究背景与问题",
            "核心创新点",
            "实验结果",
            "结论与价值"]

          },
          content: {
            type: "string"
          },
          points: {
            type: "array",
            items: {
              $ref: "#/definitions/SummaryPoint"
            },
            minItems: 1
          }
        },
        required: ["title"]
      },

      SummaryPoint: {
        type: "object",
        properties: {
          point_title: {
            type: "string",
            minLength: 2,
            maxLength: 50
          },
          content: {
            type: "string",
            minLength: 10
          },
          block_ids: {
            type: "array",
            items: {
              type: "integer",
              minimum: 0
            },
            minItems: 1
          }
        },
        required: ["point_title", "content", "block_ids"]
      }
    }
  }
};

// PageSummaryOutput Schema - 页面段落处理输出
const PageSummaryOutputSchema = {
  name: "PageSummaryOutput",
  strict: true,
  schema: {
    type: "array",
    minItems: 1,
    items: {
      type: "object",
      properties: {
        id: {
          type: "string",
          pattern: "^\\d+_\\d+$"
        },
        paragraph_summary: {
          type: "string",
          minLength: 5,
          maxLength: 100
        },
        importance_level: {
          type: "integer",
          enum: [1, 2, 3]
        },
        point_split: {
          type: "array",
          items: {
            type: "array",
            items: {
              type: "integer",
              minimum: 0
            },
            minItems: 1
          },
          minItems: 1
        },
        point_summaries: {
          type: "array",
          items: {
            type: "string",
            minLength: 5,
            maxLength: 100
          }
        },
        point_translations: {
          type: "array",
          items: {
            type: "string",
            minLength: 1
          }
        }
      },
      required: [
      "id",
      "paragraph_summary",
      "importance_level",
      "point_split",
      "point_summaries",
      "point_translations"]

    }
  }
};

// SectionsPointsOutput Schema - 章节要点输出
const SectionsPointsOutputSchema = {
  name: "SectionsPointsOutput",
  strict: true,
  schema: {
    type: "object",
    properties: {
      sections_points: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title_block_id: {
              type: "integer",
              minimum: 0
            },
            points: {
              type: "array",
              items: {
                type: "string",
                minLength: 1
              },
              minItems: 1,
              maxItems: 4
            }
          },
          required: ["title_block_id", "points"]
        },
        minItems: 1
      }
    },
    required: ["sections_points"]
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ArticleSummaryOutput: ArticleSummaryOutputSchema,
    PageSummaryOutput: PageSummaryOutputSchema,
    SectionsPointsOutput: SectionsPointsOutputSchema
  };
}