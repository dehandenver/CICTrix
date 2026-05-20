import React from 'react';
import { ChevronLeft } from 'lucide-react';

interface Props {
  employee: any;
  seminar: any;
  onBack: () => void;
}

export const TrainingEvaluationReport = ({ employee, seminar, onBack }: Props) => {
  // Generate a deterministic seed based on employee ID and seminar ID
  const employeeIdNum = parseInt(String(employee.id).replace(/\D/g, '') || '1', 10);
  const seminarIdNum = parseInt(String(seminar.id).replace(/\D/g, '') || '1', 10);
  const baseSeed = employeeIdNum * 100 + seminarIdNum;

  // Pseudo-random generator [0, 1)
  const generateRandom = (s: number) => {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  };

  const totalRespondents = 25 + Math.floor(generateRandom(baseSeed + 10) * 10);
  const totalParticipants = totalRespondents + Math.floor(generateRandom(baseSeed + 15) * 5) + 2;

  // Helper to generate realistic evaluation scores
  const generateScores = (seed: number, questions: string[]) => {
    return questions.map((q, i) => {
      const qSeed = seed + i;
      const rowTotal = totalRespondents - Math.floor(generateRandom(qSeed + 10) * 2); 
      
      let s5 = Math.floor(rowTotal * (0.4 + generateRandom(qSeed + 20) * 0.5)); 
      let s4 = Math.floor((rowTotal - s5) * (0.6 + generateRandom(qSeed + 30) * 0.4));
      let s3 = Math.floor((rowTotal - s5 - s4) * generateRandom(qSeed + 40));
      let s1 = rowTotal - s5 - s4 - s3;
      let s2 = 0;
      if (s1 > 1) {
        s2 = Math.floor(s1 / 2);
        s1 = s1 - s2;
      }
      
      const avg = ((s5 * 5) + (s4 * 4) + (s3 * 3) + (s2 * 2) + (s1 * 1)) / rowTotal;
      return { q, s5, s4, s3, s2, s1, total: rowTotal, avg };
    });
  };

  // 1. Content & Objectives
  const contentObjectives = generateScores(baseSeed + 100, [
    '1. The content and objectives of the activity is useful and interesting.',
    '2. The objectives of the activity were clearly identify and met.',
    '3. The methodology (lecture, presentation, etc.) used were appropriate and effective for learning and understanding the topic.',
    '4. The activity is useful to my work and the organization.',
    '5. The activity helped me gain skills I needed to address a specific performance gap.',
    '6. Topics discussed in the activity met my expectations.',
  ]);

  // 2. Resource Persons
  const allResourcePersons = [
    'MR. JEUS REY D. PADILLA', 'MR. INIGO D. GARINGALAO', 'MS. MICHELL MARTH ALEJANDRIA DELA CRUZ',
    'DR. MARIA SANTOS', 'ENGR. CARLOS MENDOZA', 'MR. ROBERTO CRUZ'
  ];
  const numResourcePersons = 1 + Math.floor(generateRandom(baseSeed + 200) * 3); // 1 to 3
  const rpQuestions = [
    '1. The resource person displayed an in-depth knowledge of the topic.',
    '2. The resource person was able to build rapport with the participants.',
    '3. Resource person clearly articulated the concepts in the activity.',
    '4. The resource person was able to facilitate the sessions effectively.'
  ];
  const sectionLetters = ['B', 'C', 'D'];
  const resourcePersons = Array.from({ length: numResourcePersons }).map((_, idx) => {
    const rpIdx = Math.floor(generateRandom(baseSeed + 300 + idx) * allResourcePersons.length);
    return {
      name: allResourcePersons[rpIdx],
      section: `${sectionLetters[idx]}. RESOURCE PERSON`,
      scores: generateScores(baseSeed + 400 + idx * 10, rpQuestions)
    };
  });
  
  const nextSectionLetter = String.fromCharCode(66 /* 'B' */ + numResourcePersons);

  // 3. Program Administration
  const programAdministration = generateScores(baseSeed + 500, [
    '1. The session delivered the information I expected to receive.',
    '2. The duration of the activity was just right to tackle all the topics in an average pacing.',
    '3. The facilitators are prompt and always willing to help the participants.',
    '4. The quality of the physical/virtual amenities are excellent.',
  ]);

  // 4. Narrative Responses
  const allValuableAnswers = [
    '"The practical examples and case studies were very relevant to our daily work."',
    '"Interactive discussions and networking opportunities with other departments."',
    '"The resource persons were very knowledgeable and approachable."',
    '"The hands-on workshop part was extremely helpful."',
    '"Clear and concise presentation of materials."',
    '"The tools shared can be immediately used in our processes."'
  ];
  const allSuggestionAnswers = [
    '"More time for hands-on activities and group exercises."',
    '"Would appreciate follow-up sessions to track implementation."',
    '"Consider providing training materials in digital format as well."',
    '"A bit more time allocated for Q&A would be great."',
    '"The venue could be a bit more spacious for workshops."',
    '"Shorter lecture times and more interactive activities."'
  ];

  const getAnswers = (pool: string[], seed: number) => {
    const count = 2 + Math.floor(generateRandom(seed) * 3); // 2 to 4 answers
    const answers = [];
    for (let i = 0; i < count; i++) {
      answers.push(pool[Math.floor(generateRandom(seed + i) * pool.length)]);
    }
    return Array.from(new Set(answers)); // Deduplicate
  };

  const narrativeResponses = [
    {
      question: 'What aspects of the training did you find most valuable?',
      answers: getAnswers(allValuableAnswers, baseSeed + 600)
    },
    {
      question: 'What suggestions do you have for improving future training programs?',
      answers: getAnswers(allSuggestionAnswers, baseSeed + 700)
    }
  ];

  return (
    <div className="p-6 md:p-8 pt-24 bg-gray-50 min-h-screen flex flex-col space-y-6">
      <div className="flex items-start">
        <button 
          onClick={onBack}
          type="button" 
          className="mr-4 mt-1 text-gray-500 hover:bg-gray-200 p-2 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Training Evaluation Report</h1>
          <p className="text-sm text-gray-500 mt-1">{employee.name} - {seminar.title}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 max-w-5xl mx-auto w-full">
        {/* Header Section */}
        <div className="flex flex-col items-center text-center space-y-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
            IL
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-wider">ILOILO CITY</h2>
            <p className="text-sm text-gray-500">Republic of the Philippines</p>
          </div>
          
          <div className="pt-4 w-full">
            <h3 className="font-bold text-gray-900 text-sm tracking-wide">OFFICE OF THE CITY HUMAN RESOURCE MANAGEMENT OFFICER</h3>
            <p className="text-xs text-gray-500 mt-1">
              Ground Floor, Iloilo City Hall, Plaza Libertad, Iloilo City, 5000 Philippines
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Tel. No: 333-11-11 Loc. #71 | Email: add_ica.hrmo@gmail.com
            </p>
          </div>

          <div className="pt-4 w-full border-t border-gray-100 mt-4">
            <h3 className="font-bold text-gray-900 text-sm tracking-wide mt-4">OFFICE OF THE CITY HUMAN RESOURCE MANAGEMENT OFFICER</h3>
            <p className="text-sm text-gray-600 italic mt-1">Evaluation Summary</p>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-6 space-y-3 mb-8 text-sm text-gray-900">
          <p><span className="font-semibold w-40 inline-block">Training Program:</span> {seminar.title.toUpperCase()}</p>
          <p><span className="font-semibold w-40 inline-block">Date:</span> {seminar.date}</p>
          <p><span className="font-semibold w-40 inline-block">Venue:</span> 2nd Floor LEDIP Conference Room, Iloilo City Hall</p>
          <p><span className="font-semibold w-40 inline-block">Total Participants:</span> {totalParticipants}</p>
          <p><span className="font-semibold w-40 inline-block">Total Respondents:</span> {totalRespondents}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-5 mb-10 text-sm border border-gray-100">
          <p className="font-semibold text-gray-900 mb-2">Scale:</p>
          <p className="text-gray-600">5 - Strongly Agree | 4 - Agree | 3 - Neutral | 2 - Disagree | 1 - Strongly Disagree</p>
        </div>

        {/* Section A */}
        <div className="mb-12">
          <h3 className="font-bold text-gray-900 mb-4 border-b border-gray-200 pb-2">A. CONTENT & OBJECTIVES</h3>
          <div className="overflow-x-auto border border-gray-200 rounded-lg mb-6">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Question</th>
                  <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">5</th>
                  <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">4</th>
                  <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">3</th>
                  <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">2</th>
                  <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">1</th>
                  <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-24 leading-tight">Total<br/>Respondents</th>
                  <th className="py-3 px-4 font-semibold text-gray-700 text-center">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {contentObjectives.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="py-3 px-4 border-r border-gray-200 pr-8 text-gray-800">{row.q}</td>
                    <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s5}</td>
                    <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s4}</td>
                    <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s3}</td>
                    <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s2}</td>
                    <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s1}</td>
                    <td className="py-3 px-3 text-center border-r border-gray-200 font-medium">{row.total}</td>
                    <td className="py-3 px-4 text-center font-bold text-blue-600">{row.avg.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-gray-50 rounded-xl p-8 border border-gray-100">
            <h4 className="text-center font-bold text-gray-800 mb-8 text-base">Content & Objectives</h4>
            <div className="space-y-5">
              {[...contentObjectives].reverse().map((row, idx) => {
                const itemNum = contentObjectives.length - idx;
                const percentage = (row.avg / 5) * 100;
                return (
                  <div key={idx} className="flex items-center space-x-6">
                    <span className="w-4 text-right text-gray-600 text-sm font-medium">{itemNum}.</span>
                    <div className="flex-1 relative h-7 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="absolute top-0 left-0 h-full bg-blue-500 rounded-full flex items-center justify-end pr-4 transition-all duration-1000"
                        style={{ width: `${percentage}%` }}
                      >
                        <span className="text-white text-sm font-bold">{row.avg.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Resource Persons Sections */}
        {resourcePersons.map((rp, rpIdx) => (
          <div key={rpIdx} className="mb-12">
            <h3 className="font-bold text-gray-900 mb-6 border-b border-gray-200 pb-2">{rp.section}</h3>
            <p className="font-bold text-gray-800 mb-4 uppercase text-sm">{rp.name}</p>
            
            <div className="overflow-x-auto border border-gray-200 rounded-lg mb-6">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Question</th>
                    <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">5</th>
                    <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">4</th>
                    <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">3</th>
                    <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">2</th>
                    <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">1</th>
                    <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-24 leading-tight">Total<br/>Respondents</th>
                    <th className="py-3 px-4 font-semibold text-gray-700 text-center">Average</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rp.scores.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="py-3 px-4 border-r border-gray-200 pr-8 text-gray-800">{row.q}</td>
                      <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s5}</td>
                      <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s4}</td>
                      <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s3}</td>
                      <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s2}</td>
                      <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s1}</td>
                      <td className="py-3 px-3 text-center border-r border-gray-200 font-medium">{row.total}</td>
                      <td className="py-3 px-4 text-center font-bold text-blue-600">{row.avg.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-gray-50 rounded-xl p-8 border border-gray-100">
              <div className="text-center mb-8">
                <h4 className="font-bold text-gray-800 text-base mb-1">Resource Person</h4>
                <p className="text-sm font-bold text-gray-800 uppercase">{rp.name}</p>
              </div>
              <div className="space-y-5">
                {[...rp.scores].reverse().map((row, idx) => {
                  const itemNum = rp.scores.length - idx;
                  const percentage = (row.avg / 5) * 100;
                  return (
                    <div key={idx} className="flex items-center space-x-6">
                      <span className="w-4 text-right text-gray-600 text-sm font-medium">{itemNum}.</span>
                      <div className="flex-1 relative h-7 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="absolute top-0 left-0 h-full bg-blue-500 rounded-full flex items-center justify-end pr-4 transition-all duration-1000"
                          style={{ width: `${percentage}%` }}
                        >
                          <span className="text-white text-sm font-bold">{row.avg.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        {/* Program Administration */}
        <div className="mb-12">
          <h3 className="font-bold text-gray-900 mb-4 border-b border-gray-200 pb-2">{nextSectionLetter}. PROGRAM ADMINISTRATION</h3>
          <div className="overflow-x-auto border border-gray-200 rounded-lg mb-6">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Question</th>
                  <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">5</th>
                  <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">4</th>
                  <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">3</th>
                  <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">2</th>
                  <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-10">1</th>
                  <th className="py-3 px-3 font-semibold text-gray-700 text-center border-r border-gray-200 w-24 leading-tight">Total<br/>Respondents</th>
                  <th className="py-3 px-4 font-semibold text-gray-700 text-center">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {programAdministration.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="py-3 px-4 border-r border-gray-200 pr-8 text-gray-800">{row.q}</td>
                    <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s5}</td>
                    <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s4}</td>
                    <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s3}</td>
                    <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s2}</td>
                    <td className="py-3 px-3 text-center border-r border-gray-200 text-gray-600">{row.s1}</td>
                    <td className="py-3 px-3 text-center border-r border-gray-200 font-medium">{row.total}</td>
                    <td className="py-3 px-4 text-center font-bold text-blue-600">{row.avg.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-gray-50 rounded-xl p-8 border border-gray-100">
            <h4 className="text-center font-bold text-gray-800 mb-8 text-base">Program Administration</h4>
            <div className="space-y-5">
              {[...programAdministration].reverse().map((row, idx) => {
                const itemNum = programAdministration.length - idx;
                const percentage = (row.avg / 5) * 100;
                return (
                  <div key={idx} className="flex items-center space-x-6">
                    <span className="w-4 text-right text-gray-600 text-sm font-medium">{itemNum}.</span>
                    <div className="flex-1 relative h-7 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="absolute top-0 left-0 h-full bg-blue-500 rounded-full flex items-center justify-end pr-4 transition-all duration-1000"
                        style={{ width: `${percentage}%` }}
                      >
                        <span className="text-white text-sm font-bold">{row.avg.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Narrative Responses */}
        <div className="mb-4">
          <h3 className="font-bold text-gray-900 mb-6 border-b border-gray-200 pb-2 uppercase">Narrative Responses</h3>
          <div className="space-y-8">
            {narrativeResponses.map((item, idx) => (
              <div key={idx} className="space-y-3">
                <h4 className="font-bold text-gray-800 text-sm">{item.question}</h4>
                <div className="space-y-2">
                  {item.answers.map((answer, aIdx) => (
                    <div key={aIdx} className="bg-white border border-gray-200 rounded-lg p-4 text-gray-600 text-sm italic">
                      {answer}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
