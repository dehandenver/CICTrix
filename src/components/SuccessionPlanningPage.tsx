import { useState } from 'react';
import { Network, Search, Briefcase, Plus, Users, User, ArrowRight, UserCheck, AlertTriangle, AlertCircle, RefreshCw, X, ChevronRight, Check } from 'lucide-react';
import { Button } from './Button';

export const SuccessionPlanningPage = () => {
  const [selectedPosition, setSelectedPosition] = useState<string>('');

  const mockCriticalPositions = [
    'Chief Information Officer',
    'HR Director',
    'Senior Systems Analyst',
    'Finance Manager'
  ];

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          className={`flex items-center gap-2 px-6 py-4 font-semibold text-sm transition-colors ${
            activeTab === 'planning'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('planning')}
        >
          <Network size={18} />
          Succession Planning
        </button>
        <button
          className={`flex items-center gap-2 px-6 py-4 font-semibold text-sm transition-colors ${
            activeTab === 'critical'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('critical')}
        >
          <AlertCircle size={18} />
          Critical Positions
        </button>
        <button
          className={`flex items-center gap-2 px-6 py-4 font-semibold text-sm transition-colors ${
            activeTab === 'registry'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('registry')}
        >
          <Users size={18} />
          Successor Registry
        </button>
      </div>

      {activeTab === 'planning' && (
        <div className="space-y-6">
          {/* Main Selectors (Permanent/Temporary, Department, Position) */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-4">
              <div>
                <h3 className="text-gray-500 font-semibold tracking-wide text-sm uppercase mb-1">Permanent Replacement</h3>
                <p className="text-gray-400 text-sm">
                  Cross-department • Non-negotiables: required trainings, years of experience, and civil service eligibility.
                </p>
              </div>
              <div className="flex bg-gray-50 rounded-lg p-1 border border-gray-200 shrink-0">
                <button className="px-4 py-1.5 bg-white text-gray-900 rounded-md shadow-sm text-sm font-medium border border-gray-200">Permanent</button>
                <button className="px-4 py-1.5 text-gray-500 text-sm font-medium rounded-md hover:text-gray-700">Temporary</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-2 uppercase">
                  <Briefcase size={16} /> Department
                </label>
                <div className="relative">
                  <select className="w-full appearance-none rounded-lg border border-gray-300 py-2.5 pl-4 pr-10 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white">
                    <option>Human Resources</option>
                  </select>
                  <ChevronRight size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 rotate-90 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-2 uppercase">
                  <Briefcase size={16} /> Critical Position
                </label>
                <div className="relative">
                  <select 
                    className="w-full appearance-none rounded-lg border border-gray-300 py-2.5 pl-4 pr-10 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white"
                    value={selectedPosition}
                    onChange={(e) => setSelectedPosition(e.target.value)}
                  >
                    <option value="">Select critical position...</option>
                    {mockCriticalPositions.map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                  <ChevronRight size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 rotate-90 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-gray-500 text-sm font-semibold mb-2">Total Critical Positions</h3>
              <p className="text-3xl font-bold text-gray-900">42</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-gray-500 text-sm font-semibold mb-2">Positions with Successors</h3>
              <p className="text-3xl font-bold text-gray-900">28</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-gray-500 text-sm font-semibold mb-2">Positions at Risk</h3>
              <p className="text-3xl font-bold text-red-600">14</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-gray-500 text-sm font-semibold mb-2">Readiness Index</h3>
              <p className="text-3xl font-bold text-green-600">67%</p>
            </div>
            
            
            {selectedPosition ? (
              <div className="col-span-full border border-gray-200 rounded-xl bg-white p-6 my-8">
                <div className="flex justify-between items-center mb-6">
                   <div>
                     <h2 className="text-xl font-bold text-gray-900">{selectedPosition}</h2>
                     <p className="text-gray-500 text-sm">Human Resources • Critical Level: High</p>
                   </div>
                   <Button>View Full Succession Plan</Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Mock 9-Box Distribution */}
                  <div className="border border-gray-100 rounded-lg p-5 bg-gray-50">
                    <h3 className="font-semibold text-gray-700 mb-4">Talent Distribution (9-Box)</h3>
                    <div className="grid grid-cols-3 gap-2 aspect-square text-xs font-semibold text-center">
                      <div className="bg-green-100 text-green-800 rounded flex flex-col items-center justify-center p-2">
                        <span>Stars</span>
                        <span className="text-xl mt-1">2</span>
                      </div>
                      <div className="bg-green-50 text-green-700 rounded flex flex-col items-center justify-center p-2">
                        <span>High Potential</span>
                        <span className="text-xl mt-1">1</span>
                      </div>
                      <div className="bg-blue-50 text-blue-700 rounded flex flex-col items-center justify-center p-2">
                        <span>Consistent Stars</span>
                        <span className="text-xl mt-1">0</span>
                      </div>
                      
                      <div className="bg-yellow-100 text-yellow-800 rounded flex flex-col items-center justify-center p-2">
                        <span>Key Players</span>
                        <span className="text-xl mt-1">3</span>
                      </div>
                      <div className="bg-gray-100 text-gray-700 rounded flex flex-col items-center justify-center p-2">
                        <span>Core Employees</span>
                        <span className="text-xl mt-1">5</span>
                      </div>
                      <div className="bg-yellow-50 text-yellow-700 rounded flex flex-col items-center justify-center p-2">
                        <span>High Performers</span>
                        <span className="text-xl mt-1">1</span>
                      </div>

                      <div className="bg-red-100 text-red-800 rounded flex flex-col items-center justify-center p-2">
                        <span>Risk</span>
                        <span className="text-xl mt-1">0</span>
                      </div>
                      <div className="bg-orange-50 text-orange-700 rounded flex flex-col items-center justify-center p-2">
                        <span>Inconsistent</span>
                        <span className="text-xl mt-1">2</span>
                      </div>
                      <div className="bg-blue-100 text-blue-800 rounded flex flex-col items-center justify-center p-2">
                        <span>Solid Pros.</span>
                        <span className="text-xl mt-1">4</span>
                      </div>
                    </div>
                  </div>

                  {/* Mock Identified Successors */}
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-4">Identified Successors</h3>
                    <div className="space-y-3">
                      <div className="p-3 border border-green-200 bg-green-50 rounded-lg flex justify-between items-center">
                         <div className="flex items-center gap-3">
                           <div className="h-10 w-10 bg-green-200 text-green-800 rounded-full flex items-center justify-center font-bold">AJ</div>
                           <div>
                             <p className="font-bold text-gray-900 leading-tight">Ashley Johnson</p>
                             <p className="text-xs text-gray-600">Senior Recruiter • Ready Now</p>
                           </div>
                         </div>
                         <div className="text-right">
                           <p className="text-sm font-bold text-green-700">92% Match</p>
                         </div>
                      </div>
                      
                      <div className="p-3 border border-yellow-200 bg-yellow-50 rounded-lg flex justify-between items-center">
                         <div className="flex items-center gap-3">
                           <div className="h-10 w-10 bg-yellow-200 text-yellow-800 rounded-full flex items-center justify-center font-bold">MR</div>
                           <div>
                             <p className="font-bold text-gray-900 leading-tight">Michael Ross</p>
                             <p className="text-xs text-gray-600">Compensation Specialist • 1-2 Years</p>
                           </div>
                         </div>
                         <div className="text-right">
                           <p className="text-sm font-bold text-yellow-700">78% Match</p>
                         </div>
                      </div>

                      <div className="p-3 border border-gray-200 bg-white rounded-lg flex justify-between items-center border-dashed">
                         <div className="flex items-center gap-3 text-gray-400">
                           <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                             <Plus size={20} />
                           </div>
                           <p className="font-medium text-sm">Add Successor</p>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="col-span-full border border-gray-200 rounded-xl bg-white p-8 text-center text-gray-500 my-8">
                Select a critical position to view succession details or go to Critical Positions to manage them.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'critical' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex gap-4 flex-1 max-w-2xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search positions..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <select className="border border-gray-300 rounded-lg px-4 py-2 bg-white">
                <option>All Departments</option>
                <option>Information Technology</option>
                <option>Human Resources</option>
              </select>
              <select className="border border-gray-300 rounded-lg px-4 py-2 bg-white">
                <option>Status: All</option>
                <option>At Risk</option>
                <option>Covered</option>
              </select>
            </div>
            <Button className="flex items-center gap-2">
              <Plus size={18} /> Identify Critical Position
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
             {/* Stub cards. Real cards will come next */}
             {[1,2,3,4,5,6].map(i => (
                <div key={i} className="border border-gray-200 rounded-xl bg-white p-5 hover:border-blue-500 transition-colors cursor-pointer">
                  <div className="flex justify-between items-start mb-4">
                    <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1">
                      <AlertTriangle size={12} /> High Risk
                    </span>
                    <button className="text-gray-400 hover:text-gray-600">...</button>
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 mb-1">Chief Information Officer</h4>
                  <p className="text-gray-500 text-sm mb-4">Information Technology</p>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Current Occupant</span>
                      <span className="font-semibold">Juan Dela Cruz</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Expected Vacancy</span>
                      <span className="font-semibold text-yellow-600">Retiring in 6 mos</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Readiness Gap</span>
                      <span className="font-semibold text-red-600">Significant</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex justify-between items-center text-sm">
                    <span className="text-gray-500">No Ready Successors (0)</span>
                    <button className="text-blue-600 font-semibold hover:underline">Manage &rarr;</button>
                  </div>
                </div>
             ))}
          </div>
        </div>
      )}

      {activeTab === 'registry' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex gap-4 flex-1 max-w-2xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search successors..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <select className="border border-gray-300 rounded-lg px-4 py-2 bg-white">
                <option>Filter by Readiness</option>
                <option>Ready Now (1-2 yrs)</option>
                <option>Ready Later (3-5 yrs)</option>
              </select>
            </div>
            <Button variant="secondary" className="flex items-center gap-2 border-gray-300">
              <RefreshCw size={18} /> Run Readiness Engine
            </Button>
          </div>

          <div className="border border-gray-200 rounded-xl bg-white overflow-hidden text-sm">
             <table className="w-full text-left">
               <thead className="bg-gray-50 border-b border-gray-200">
                 <tr>
                   <th className="px-6 py-4 font-semibold text-gray-600">Name</th>
                   <th className="px-6 py-4 font-semibold text-gray-600">Current Position</th>
                   <th className="px-6 py-4 font-semibold text-gray-600">Target Critical Role</th>
                   <th className="px-6 py-4 font-semibold text-gray-600">Readiness Score</th>
                   <th className="px-6 py-4 font-semibold text-gray-600">Status</th>
                   <th className="px-6 py-4 font-semibold text-gray-600">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-100">
                 <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">MR</div>
                        <span className="font-semibold text-gray-900">Maria Rodriguez</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500">IT Division Head</td>
                    <td className="px-6 py-4 font-semibold">Chief Information Officer</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 w-[85%]"></div>
                        </div>
                        <span className="font-semibold text-green-600">85%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-semibold">Ready Now</span>
                    </td>
                    <td className="px-6 py-4">
                      <button className="text-blue-600 hover:text-blue-800 font-semibold">View Plan</button>
                    </td>
                 </tr>
                 {/* Adding more rows would go here */}
               </tbody>
             </table>
          </div>
        </div>
      )}
    </div>
  );
};
