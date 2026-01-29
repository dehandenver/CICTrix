import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ApplicantWizard } from './modules/applicant/ApplicantWizard';
import { InterviewerDashboard } from './modules/interviewer/InterviewerDashboard';
import { EvaluationForm } from './modules/interviewer/EvaluationForm';
import './styles/globals.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<ApplicantWizard />} />
          <Route path="/dashboard" element={<InterviewerDashboard />} />
          <Route path="/evaluate/:id" element={<EvaluationForm />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
