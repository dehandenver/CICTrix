-- Insert Sample Job Postings (using standardized positions from positions.ts)
INSERT INTO jobs (title, item_number, salary_grade, department, description, status, created_at) VALUES
('Administrative Officer', 'ITEM-001', '15', 'Operations', 'Responsible for administrative tasks and office management', 'Open', '2026-01-15'),
('Budget Officer', 'ITEM-002', '18', 'Finance', 'Handles budget planning and financial analysis', 'Open', '2026-01-16'),
('Project Coordinator', 'ITEM-003', '18', 'Operations', 'Project planning and development coordination', 'Open', '2026-01-17'),
('IT Specialist', 'ITEM-004', '16', 'Information Technology', 'IT infrastructure management and support', 'Open', '2026-01-18'),
('Human Resource Specialist', 'ITEM-005', '18', 'Human Resources', 'Recruit, hire and manage employees', 'Open', '2026-01-19')
ON CONFLICT DO NOTHING;

-- Insert Sample Applicants for Administrative Officer (8 applicants)
INSERT INTO applicants (first_name, middle_name, last_name, email, contact_number, address, position, item_number, office, is_pwd, status, created_at) VALUES
('Maria', 'Cruz', 'Santos', 'maria.santos@email.com', '09171234567', '123 Main St, Manila', 'Administrative Officer', 'ITEM-001', 'Operations', false, 'Pending', '2026-01-20'),
('Juan', 'Miguel', 'Dela Cruz', 'juan.delacruz@email.com', '09181234567', '456 Oak Ave, Quezon City', 'Administrative Officer', 'ITEM-001', 'Operations', false, 'Pending', '2026-01-21'),
('Ana', 'Marie', 'Reyes', 'ana.reyes@email.com', '09191234567', '789 Pine Rd, Makati', 'Administrative Officer', 'ITEM-001', 'Operations', false, 'Reviewed', '2026-01-22'),
('Pedro', 'Santos', 'Garcia', 'pedro.garcia@email.com', '09201234567', '321 Elm St, Pasig', 'Administrative Officer', 'ITEM-001', 'Operations', false, 'Pending', '2026-01-23'),
('Luisa', 'Cruz', 'Fernandez', 'luisa.fernandez@email.com', '09211234567', '654 Maple Dr, Mandaluyong', 'Administrative Officer', 'ITEM-001', 'Operations', true, 'Pending', '2026-01-24'),
('Carlos', 'Antonio', 'Mendoza', 'carlos.mendoza@email.com', '09221234567', '987 Cedar Ln, Taguig', 'Administrative Officer', 'ITEM-001', 'Operations', false, 'Reviewed', '2026-01-25'),
('Sofia', 'Isabel', 'Torres', 'sofia.torres@email.com', '09231234567', '147 Birch Ct, Pasay', 'Administrative Officer', 'ITEM-001', 'Operations', false, 'Accepted', '2026-01-26'),
('Miguel', 'Jose', 'Ramos', 'miguel.ramos@email.com', '09241234567', '258 Spruce Way, Las Piñas', 'Administrative Officer', 'ITEM-001', 'Operations', false, 'Pending', '2026-01-27'),

-- Insert Sample Applicants for Budget Officer (5 applicants)
('Elena', 'Maria', 'Gonzales', 'elena.gonzales@email.com', '09251234567', '369 Willow St, Muntinlupa', 'Budget Officer', 'ITEM-002', 'Finance', false, 'Pending', '2026-01-20'),
('Ricardo', 'Manuel', 'Cruz', 'ricardo.cruz@email.com', '09261234567', '741 Ash Blvd, Parañaque', 'Budget Officer', 'ITEM-002', 'Finance', false, 'Reviewed', '2026-01-21'),
('Carmen', 'Rosa', 'Lopez', 'carmen.lopez@email.com', '09271234567', '852 Cherry Ave, Caloocan', 'Budget Officer', 'ITEM-002', 'Finance', false, 'Pending', '2026-01-22'),
('Antonio', 'Luis', 'Vargas', 'antonio.vargas@email.com', '09281234567', '963 Poplar Rd, Malabon', 'Budget Officer', 'ITEM-002', 'Finance', false, 'Pending', '2026-01-23'),
('Isabel', 'Grace', 'Morales', 'isabel.morales@email.com', '09291234567', '159 Cypress Dr, Navotas', 'Budget Officer', 'ITEM-002', 'Finance', false, 'Accepted', '2026-01-24'),

-- Insert Sample Applicants for Project Coordinator (12 applicants)
('Roberto', 'Carlos', 'Sanchez', 'roberto.sanchez@email.com', '09301234567', '357 Redwood Ln, Valenzuela', 'Project Coordinator', 'ITEM-003', 'Operations', false, 'Pending', '2026-01-20'),
('Teresa', 'Angela', 'Martinez', 'teresa.martinez@email.com', '09311234567', '468 Sequoia Ct, Marikina', 'Project Coordinator', 'ITEM-003', 'Operations', false, 'Reviewed', '2026-01-21'),
('Fernando', 'Miguel', 'Castillo', 'fernando.castillo@email.com', '09321234567', '579 Magnolia Way, San Juan', 'Project Coordinator', 'ITEM-003', 'Operations', false, 'Pending', '2026-01-22'),
('Patricia', 'Sofia', 'Rivera', 'patricia.rivera@email.com', '09331234567', '680 Palm St, Mandaluyong', 'Project Coordinator', 'ITEM-003', 'Operations', false, 'Pending', '2026-01-23'),
('Domingo', 'Lorenzo', 'Santos', 'domingo.santos@email.com', '09341234567', '791 Walnut Ave, Pasig', 'Project Coordinator', 'ITEM-003', 'Operations', true, 'Reviewed', '2026-01-24'),
('Angelica', 'Marie', 'Flores', 'angelica.flores@email.com', '09351234567', '802 Pecan Rd, Quezon City', 'Project Coordinator', 'ITEM-003', 'Operations', false, 'Pending', '2026-01-25'),
('Gabriel', 'Rafael', 'Cruz', 'gabriel.cruz@email.com', '09361234567', '913 Hickory Dr, Manila', 'Project Coordinator', 'ITEM-003', 'Operations', false, 'Pending', '2026-01-26'),
('Rosa', 'Elena', 'Diaz', 'rosa.diaz@email.com', '09371234567', '024 Beech Ln, Makati', 'Project Coordinator', 'ITEM-003', 'Operations', false, 'Reviewed', '2026-01-27'),
('Ernesto', 'Pablo', 'Aquino', 'ernesto.aquino@email.com', '09381234567', '135 Sycamore Ct, Taguig', 'Project Coordinator', 'ITEM-003', 'Operations', false, 'Accepted', '2026-01-28'),
('Gloria', 'Carmen', 'Pascual', 'gloria.pascual@email.com', '09391234567', '246 Chestnut Way, Pasay', 'Project Coordinator', 'ITEM-003', 'Operations', false, 'Pending', '2026-01-29'),
('Ramon', 'Antonio', 'Bautista', 'ramon.bautista@email.com', '09401234567', '357 Dogwood St, Las Piñas', 'Project Coordinator', 'ITEM-003', 'Operations', false, 'Pending', '2026-01-30'),
('Melissa', 'Rose', 'Valdez', 'melissa.valdez@email.com', '09411234567', '468 Juniper Ave, Muntinlupa', 'Project Coordinator', 'ITEM-003', 'Operations', false, 'Pending', '2026-01-31'),

-- Insert Sample Applicants for IT Specialist (15 applicants)
('Christopher', 'James', 'Navarro', 'christopher.navarro@email.com', '09421234567', '579 Alder Rd, Parañaque', 'IT Specialist', 'ITEM-004', 'Information Technology', false, 'Pending', '2026-01-20'),
('Diana', 'Patricia', 'Aguilar', 'diana.aguilar@email.com', '09431234567', '680 Laurel Dr, Caloocan', 'IT Specialist', 'ITEM-004', 'Information Technology', false, 'Reviewed', '2026-01-21'),
('Eduardo', 'Vicente', 'Salazar', 'eduardo.salazar@email.com', '09441234567', '791 Hawthorn Ln, Malabon', 'IT Specialist', 'ITEM-004', 'Information Technology', false, 'Pending', '2026-01-22'),
('Francesca', 'Angelina', 'Ramos', 'francesca.ramos@email.com', '09451234567', '802 Cottonwood Ct, Navotas', 'IT Specialist', 'ITEM-004', 'Information Technology', false, 'Pending', '2026-01-23'),
('Gregorio', 'Emmanuel', 'Mendez', 'gregorio.mendez@email.com', '09461234567', '913 Aspen Way, Valenzuela', 'IT Specialist', 'ITEM-004', 'Information Technology', true, 'Reviewed', '2026-01-24'),
('Helena', 'Maria', 'Cruz', 'helena.cruz@email.com', '09471234567', '024 Fir St, Marikina', 'IT Specialist', 'ITEM-004', 'Information Technology', false, 'Pending', '2026-01-25'),
('Ignacio', 'Fernando', 'Torres', 'ignacio.torres@email.com', '09481234567', '135 Hemlock Ave, San Juan', 'IT Specialist', 'ITEM-004', 'Information Technology', false, 'Pending', '2026-01-26'),
('Josefa', 'Teresa', 'Reyes', 'josefa.reyes@email.com', '09491234567', '246 Linden Rd, Mandaluyong', 'IT Specialist', 'ITEM-004', 'Information Technology', false, 'Reviewed', '2026-01-27'),
('Lorenzo', 'Gabriel', 'Garcia', 'lorenzo.garcia@email.com', '09501234567', '357 Mulberry Dr, Pasig', 'IT Specialist', 'ITEM-004', 'Information Technology', false, 'Accepted', '2026-01-28'),
('Monica', 'Isabel', 'Santos', 'monica.santos@email.com', '09511234567', '468 Sassafras Ln, Quezon City', 'IT Specialist', 'ITEM-004', 'Information Technology', false, 'Pending', '2026-01-29'),
('Nestor', 'Ricardo', 'Fernandez', 'nestor.fernandez@email.com', '09521234567', '579 Catalpa Ct, Manila', 'IT Specialist', 'ITEM-004', 'Information Technology', false, 'Pending', '2026-01-30'),
('Olivia', 'Grace', 'Mendoza', 'olivia.mendoza@email.com', '09531234567', '680 Locust Way, Makati', 'IT Specialist', 'ITEM-004', 'Information Technology', false, 'Reviewed', '2026-01-31'),
('Pablo', 'Andres', 'Gonzales', 'pablo.gonzales@email.com', '09541234567', '791 Buckeye St, Taguig', 'IT Specialist', 'ITEM-004', 'Information Technology', false, 'Pending', '2026-02-01'),
('Querida', 'Luisa', 'Lopez', 'querida.lopez@email.com', '09551234567', '802 Buttonwood Ave, Pasay', 'IT Specialist', 'ITEM-004', 'Information Technology', false, 'Pending', '2026-02-02'),
('Rodrigo', 'Manuel', 'Vargas', 'rodrigo.vargas@email.com', '09561234567', '913 Ironwood Rd, Las Piñas', 'IT Specialist', 'ITEM-004', 'Information Technology', false, 'Pending', '2026-02-03'),

-- Insert Sample Applicants for Human Resource Specialist (6 applicants)
('Sandra', 'Elena', 'Morales', 'sandra.morales@email.com', '09571234567', '024 Boxwood Dr, Muntinlupa', 'Human Resource Specialist', 'ITEM-005', 'Human Resources', false, 'Pending', '2026-01-20'),
('Teodoro', 'Carlos', 'Sanchez', 'teodoro.sanchez@email.com', '09581234567', '135 Yew Ln, Parañaque', 'Human Resource Specialist', 'ITEM-005', 'Human Resources', false, 'Reviewed', '2026-01-21'),
('Ursula', 'Rosa', 'Martinez', 'ursula.martinez@email.com', '09591234567', '246 Elder Ct, Caloocan', 'Human Resource Specialist', 'ITEM-005', 'Human Resources', false, 'Pending', '2026-01-22'),
('Vicente', 'Domingo', 'Castillo', 'vicente.castillo@email.com', '09601234567', '357 Holly Way, Malabon', 'Human Resource Specialist', 'ITEM-005', 'Human Resources', true, 'Pending', '2026-01-23'),
('Wilhelmina', 'Angela', 'Rivera', 'wilhelmina.rivera@email.com', '09611234567', '468 Larch St, Navotas', 'Human Resource Specialist', 'ITEM-005', 'Human Resources', false, 'Reviewed', '2026-01-24'),
('Xavier', 'Benjamin', 'Santos', 'xavier.santos@email.com', '09621234567', '579 Tamarack Ave, Valenzuela', 'Human Resource Specialist', 'ITEM-005', 'Human Resources', false, 'Accepted', '2026-01-25')
ON CONFLICT DO NOTHING;

-- Verify data was inserted
SELECT 'Jobs inserted:' as info, COUNT(*) as count FROM jobs;
SELECT 'Applicants inserted:' as info, COUNT(*) as count FROM applicants;
