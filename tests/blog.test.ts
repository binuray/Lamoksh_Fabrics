import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/database';
import { hashPassword } from '../src/utils/password';
import { issueTokens } from '../src/services/token.service';

describe('Blog Management Backend Module Test Suite', () => {
  let superAdminToken: string;
  let customerToken: string;
  let testBlogId: string;
  let testBlogSlug: string;
  let draftBlogId: string;
  let uploadedImageId: string;

  beforeAll(async () => {
    // 1. Clean up any leftover test blogs and images
    await prisma.blogImage.deleteMany({});
    await prisma.blog.deleteMany({});

    // 2. Ensure Super Admin role and user
    const superAdminRole = await prisma.role.upsert({
      where: { name: 'SUPER_ADMIN' },
      update: {},
      create: { name: 'SUPER_ADMIN', description: 'Super Admin' },
    });

    let superAdmin = await prisma.user.findFirst({
      where: { roleId: superAdminRole.id, deletedAt: null },
    });

    if (!superAdmin) {
      const passwordHash = await hashPassword('AdminPass@123');
      superAdmin = await prisma.user.create({
        data: {
          name: 'Blog Test Admin',
          email: `blog_admin_${Date.now()}@example.com`,
          mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
          passwordHash,
          roleId: superAdminRole.id,
          isVerified: true,
          isActive: true,
        },
      });
    }

    const adminTokens = await issueTokens(superAdmin.id, 'SUPER_ADMIN');
    superAdminToken = adminTokens.accessToken;

    // 3. Ensure Customer role and user
    const customerRole = await prisma.role.upsert({
      where: { name: 'CUSTOMER' },
      update: {},
      create: { name: 'CUSTOMER', description: 'Customer' },
    });

    let customerUser = await prisma.user.findFirst({
      where: { roleId: customerRole.id, deletedAt: null },
    });

    if (!customerUser) {
      const passwordHash = await hashPassword('CustomerPass@123');
      customerUser = await prisma.user.create({
        data: {
          name: 'Blog Test Customer',
          email: `blog_customer_${Date.now()}@example.com`,
          mobile: `8${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
          passwordHash,
          roleId: customerRole.id,
          isVerified: true,
          isActive: true,
        },
      });
    }

    const custTokens = await issueTokens(customerUser.id, 'CUSTOMER');
    customerToken = custTokens.accessToken;
  });

  afterAll(async () => {
    // Clean up test blogs created during tests
    await prisma.blogImage.deleteMany({});
    await prisma.blog.deleteMany({});
    await prisma.$disconnect();
  });

  describe('1. Authentication & Authorization for Admin Blog APIs', () => {
    it('should reject unauthenticated request to admin blog endpoints (401)', async () => {
      const res = await request(app).get('/api/v1/admin/blogs');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should forbid customer role from accessing admin blog endpoints (403)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/blogs')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow Super Admin to access admin blog endpoints (200)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/blogs')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.blogs)).toBe(true);
    });
  });

  describe('2. Blog Creation, SEO Slugs, and Content Sanitization', () => {
    it('should validate required fields when creating a blog', async () => {
      const res = await request(app)
        .post('/api/v1/admin/blogs')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ title: 'Short' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should automatically generate an SEO-friendly slug when none is provided', async () => {
      const payload = {
        title: 'Complete Guide to Digital Marketing & SEO in 2026!',
        description: 'Learn the latest digital marketing strategies for high search ranking.',
        content: '<p>Search engine optimization in 2026 requires authentic content and technical excellence.</p>',
        category: 'Digital Marketing',
        tags: ['SEO', 'Marketing', 'Trends'],
        author: 'Marketing Pro',
        seoTitle: 'Complete SEO Guide 2026',
        metaDescription: 'Boost your website search ranking with these top tips.',
        keywords: ['seo', 'digital marketing', 'google ranking'],
        status: 'PUBLISHED',
      };

      const res = await request(app)
        .post('/api/v1/admin/blogs')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blog.title).toBe(payload.title);
      expect(res.body.data.blog.slug).toBe('complete-guide-to-digital-marketing-seo-in-2026');
      expect(res.body.data.blog.status).toBe('PUBLISHED');
      expect(res.body.data.blog.publishedAt).not.toBeNull();
      expect(res.body.data.blog.tags).toEqual(['SEO', 'Marketing', 'Trends']);
      expect(res.body.data.blog.keywords).toEqual(['seo', 'digital marketing', 'google ranking']);

      testBlogId = res.body.data.blog.id;
      testBlogSlug = res.body.data.blog.slug;
    });

    it('should automatically resolve duplicate slug collisions with incrementing suffix', async () => {
      const payload = {
        title: 'Complete Guide to Digital Marketing & SEO in 2026!',
        description: 'Duplicate title to test automatic slug uniqueness guarantee.',
        content: '<p>Another blog with the identical title should receive a unique slug.</p>',
        category: 'Digital Marketing',
        tags: ['SEO'],
      };

      const res = await request(app)
        .post('/api/v1/admin/blogs')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blog.slug).toBe('complete-guide-to-digital-marketing-seo-in-2026-1');
    });

    it('should sanitize HTML content and strip malicious scripts / XSS attack vectors', async () => {
      const dirtyHtml = `
        <h2>Safe Heading</h2>
        <p>Safe paragraph with <strong>bold</strong> text.</p>
        <script>alert("XSS Vulnerability!");</script>
        <img src="/uploads/blogs/test.png" onerror="alert('hack')" alt="Test Graphic" />
        <a href="javascript:alert('malicious')">Dangerous Link</a>
        <a href="https://example.com" target="_blank">External Link</a>
      `;

      const payload = {
        title: 'Understanding Web Application Security and XSS Protection',
        description: 'Why HTML sanitization is crucial for digital platforms.',
        content: dirtyHtml,
        category: 'Cybersecurity',
        tags: ['Security', 'XSS', 'BestPractices'],
      };

      const res = await request(app)
        .post('/api/v1/admin/blogs')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      const sanitized = res.body.data.blog.content;

      // Safe HTML tags should be preserved
      expect(sanitized).toContain('<h2>Safe Heading</h2>');
      expect(sanitized).toContain('<strong>bold</strong>');
      expect(sanitized).toContain('alt="Test Graphic"');
      expect(sanitized).toContain('rel="noopener noreferrer"');

      // Malicious content must be completely stripped
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert(');
      expect(sanitized).not.toContain('onerror=');
      expect(sanitized).not.toContain('javascript:');
    });

    it('should create a blog with featured image and gallery images via multipart/form-data', async () => {
      const dummyImageBuffer = Buffer.from('image-png-sample-binary-data');

      const res = await request(app)
        .post('/api/v1/admin/blogs')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('title', 'E-commerce Trends and Modern Fabric Innovations')
        .field('description', 'How modern textiles and online commerce are transforming retail.')
        .field('content', '<p>The fabric industry is seeing a huge wave of sustainable innovation.</p>')
        .field('category', 'Textiles & Fashion')
        .field('tags', 'E-commerce, Textiles, Fashion, Sustainability')
        .field('keywords', 'fabric, cotton, sustainable, ecommerce')
        .field('featuredImageAlt', 'Modern Textile Factory Display')
        .field('imageAltTexts', JSON.stringify(['Fabric Sample Closeup', 'Weaving Process']))
        .field('status', 'DRAFT')
        .attach('featuredImage', dummyImageBuffer, 'featured.png')
        .attach('images', dummyImageBuffer, 'sample1.png')
        .attach('images', dummyImageBuffer, 'sample2.png');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blog.featuredImage).toBeTruthy();
      expect(res.body.data.blog.featuredImageAlt).toBe('Modern Textile Factory Display');
      expect(res.body.data.blog.status).toBe('DRAFT');
      expect(res.body.data.blog.images.length).toBe(2);
      expect(res.body.data.blog.tags).toContain('Textiles');

      draftBlogId = res.body.data.blog.id;
    });
  });

  describe('3. Blog Image Uploads and Asset Management', () => {
    it('should upload a standalone blog image for rich text editor integration', async () => {
      const dummyBuffer = Buffer.from('sample-standalone-image');

      const res = await request(app)
        .post('/api/v1/admin/blogs/upload-image')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('altText', 'Inline SEO Chart')
        .field('blogId', testBlogId)
        .attach('image', dummyBuffer, 'seo-chart.png');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.image.url).toContain('/uploads/blogs/content/');
      expect(res.body.data.image.altText).toBe('Inline SEO Chart');

      uploadedImageId = res.body.data.image.id;
    });

    it('should reject invalid non-image file uploads', async () => {
      const dummyTextBuffer = Buffer.from('plain text file content');

      const res = await request(app)
        .post('/api/v1/admin/blogs/upload-image')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('image', dummyTextBuffer, 'document.txt');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid image file format');
    });

    it('should update image alt text and toggle featured status', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/blogs/${testBlogId}/images/${uploadedImageId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          altText: 'Updated SEO Performance Metrics Chart',
          isFeatured: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.image.altText).toBe('Updated SEO Performance Metrics Chart');
      expect(res.body.data.image.isFeatured).toBe(true);
    });

    it('should delete a specific blog image', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/blogs/${testBlogId}/images/${uploadedImageId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Image deleted successfully');
    });
  });

  describe('4. Admin Management: List, Search, Filter, Update, Publish & Delete', () => {
    it('should fetch admin blog list with pagination and meta', async () => {
      const res = await request(app)
        .get('/api/v1/admin/blogs?page=1&limit=5')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.meta.page).toBe(1);
      expect(res.body.data.meta.limit).toBe(5);
      expect(res.body.data.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('should filter admin blogs by status (DRAFT)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/blogs?status=DRAFT')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const allDrafts = res.body.data.blogs.every((b: any) => b.status === 'DRAFT');
      expect(allDrafts).toBe(true);
    });

    it('should filter admin blogs by category', async () => {
      const res = await request(app)
        .get('/api/v1/admin/blogs?category=Digital Marketing')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blogs.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.blogs[0].category).toBe('Digital Marketing');
    });

    it('should search blogs by keyword in title/description', async () => {
      const res = await request(app)
        .get('/api/v1/admin/blogs?search=Textile')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blogs.length).toBeGreaterThanOrEqual(1);
    });

    it('should update blog details successfully', async () => {
      const res = await request(app)
        .put(`/api/v1/admin/blogs/${testBlogId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          title: 'Updated: Complete Guide to Digital Marketing & SEO 2026',
          category: 'Advanced Digital Marketing',
          tags: ['SEO', 'Digital Marketing', 'Growth'],
          seoTitle: 'Updated SEO Masterclass 2026',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blog.title).toBe('Updated: Complete Guide to Digital Marketing & SEO 2026');
      expect(res.body.data.blog.category).toBe('Advanced Digital Marketing');
      expect(res.body.data.blog.seoTitle).toBe('Updated SEO Masterclass 2026');
    });

    it('should publish a draft blog post', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/blogs/${draftBlogId}/publish`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blog.status).toBe('PUBLISHED');
      expect(res.body.data.blog.publishedAt).not.toBeNull();
    });

    it('should unpublish a published blog post back to draft', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/blogs/${draftBlogId}/unpublish`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blog.status).toBe('DRAFT');
    });

    it('should fetch distinct admin blog categories with counts', async () => {
      const res = await request(app)
        .get('/api/v1/admin/blogs/categories')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.categories)).toBe(true);
      expect(res.body.data.categories.length).toBeGreaterThan(0);
      expect(res.body.data.categories[0]).toHaveProperty('category');
      expect(res.body.data.categories[0]).toHaveProperty('count');
    });

    it('should delete a blog post and clean up records', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/blogs/${draftBlogId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Blog deleted successfully');

      // Verify record is gone
      const checkRes = await request(app)
        .get(`/api/v1/admin/blogs/${draftBlogId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(checkRes.status).toBe(404);
    });
  });

  describe('5. Public Blog APIs', () => {
    it('should retrieve list of published blogs for public view', async () => {
      const res = await request(app).get('/api/v1/blogs?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.blogs)).toBe(true);
      expect(res.body.data.blogs.length).toBeGreaterThanOrEqual(1);

      // Verify only published blogs are returned
      for (const blog of res.body.data.blogs) {
        expect(blog.publishedAt).not.toBeNull();
      }
    });

    it('should fetch a published blog by slug', async () => {
      const res = await request(app).get(`/api/v1/blogs/${testBlogSlug}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blog.slug).toBe(testBlogSlug);
      expect(res.body.data.blog.content).toBeTruthy();
    });

    it('should fetch a published blog by UUID', async () => {
      const res = await request(app).get(`/api/v1/blogs/${testBlogId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blog.id).toBe(testBlogId);
    });

    it('should return 404 for non-existent blog on public API', async () => {
      const res = await request(app).get('/api/v1/blogs/non-existent-blog-slug-404');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should fetch distinct published blog categories', async () => {
      const res = await request(app).get('/api/v1/blogs/categories');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.categories)).toBe(true);
    });

    it('should fetch published blog tags', async () => {
      const res = await request(app).get('/api/v1/blogs/tags');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.tags)).toBe(true);
      expect(res.body.data.tags).toContain('SEO');
    });

    it('should filter public blogs by tag', async () => {
      const res = await request(app).get('/api/v1/blogs?tag=SEO');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blogs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
