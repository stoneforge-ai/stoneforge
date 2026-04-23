import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    date: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z
      .object({
        name: z.string(),
        url: z.string().url().optional(),
        avatar: z.string().optional(),
      })
      .default({ name: 'Adam King', url: 'https://x.com/notadamking' }),
    image: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    relatedContent: z
      .array(
        z.object({
          title: z.string(),
          url: z.string(),
          type: z.enum(['docs', 'blog', 'use-case', 'compare']),
        }),
      )
      .optional(),
  }),
});

const useCases = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/use-cases' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    problem: z.string(),
    icon: z.string().optional(),
    docsLinks: z.array(z.object({
      title: z.string(),
      url: z.string(),
    })).default([]),
    faqItems: z.array(z.object({
      question: z.string(),
      answer: z.string(),
    })).default([]),
    order: z.number(),
  }),
});

const integrations = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/integrations' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    agentName: z.string(),
    agentUrl: z.string(),
    logo: z.string().optional(),
    configSnippet: z.string(),
    features: z.array(z.object({
      feature: z.string(),
      stoneforgeAdds: z.string(),
    })),
    docsLinks: z.array(z.object({
      title: z.string(),
      url: z.string(),
    })).default([]),
    order: z.number(),
  }),
});

const comparisons = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/comparisons' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    competitor: z.string(),
    competitorUrl: z.string().optional(),
    differentiator: z.string(),
    features: z.array(z.object({
      category: z.string(),
      feature: z.string(),
      stoneforge: z.string(),
      competitor: z.string(),
    })),
    faqItems: z.array(z.object({
      question: z.string(),
      answer: z.string(),
    })).default([]),
    verdict: z.string(),
    order: z.number(),
  }),
});

export const collections = { blog, 'use-cases': useCases, integrations, comparisons };
