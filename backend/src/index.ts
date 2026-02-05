import express from 'express';
import cors from 'cors';
import { config } from './config';
import authRoutes from './routes/auth';
import applicantRoutes from './routes/applicants';
import evaluationRoutes from './routes/evaluations';

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'CICTrix HRIS API is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.use('/api/auth', authRoutes);
app.use('/api/applicants', applicantRoutes);
app.use('/api/evaluations', evaluationRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
  console.log(`📚 API Docs: http://localhost:${PORT}/docs (install Swagger UI)`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});
