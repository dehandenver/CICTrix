-- Insert Sample Job Postings
INSERT INTO jobs (title, item_number, salary_grade, department, description, status, created_at) VALUES
('Administrative Officer III', 'ITEM-001', '15', 'Office of the City Mayor', 'Responsible for administrative tasks and office management', 'Open', '2026-01-15'),
('Budget Officer II', 'ITEM-002', '18', 'City Budget Office', 'Handles budget planning and financial analysis', 'Open', '2026-01-16'),
('Planning Officer II', 'ITEM-003', '18', 'City Planning and Development', 'Urban planning and development coordination', 'Open', '2026-01-17'),
('Information Technology Officer I', 'ITEM-004', '16', 'Management Information System', 'IT infrastructure management and support', 'Open', '2026-01-18'),
('Social Welfare Officer II', 'ITEM-005', '18', 'City Social Welfare and Development', 'Social services program implementation', 'Open', '2026-01-19')
ON CONFLICT DO NOTHING;

-- Insert Sample Applicants for Administrative Officer III (8 applicants)
INSERT INTO applicants (name, email, contact_number, address, position, item_number, office, is_pwd, status, created_at) VALUES
('Maria Santos', 'maria.santos@email.com', '09171234567', '123 Main St, Manila', 'Administrative Officer III', 'ITEM-001', 'Human Resource Management', false, 'Pending', '2026-01-20'),
('Juan Dela Cruz', 'juan.delacruz@email.com', '09181234567', '456 Oak Ave, Quezon City', 'Administrative Officer III', 'ITEM-001', 'Human Resource Management', false, 'Pending', '2026-01-21'),
('Ana Reyes', 'ana.reyes@email.com', '09191234567', '789 Pine Rd, Makati', 'Administrative Officer III', 'ITEM-001', 'Human Resource Management', false, 'Reviewed', '2026-01-22'),
('Pedro Garcia', 'pedro.garcia@email.com', '09201234567', '321 Elm St, Pasig', 'Administrative Officer III', 'ITEM-001', 'Human Resource Management', false, 'Pending', '2026-01-23'),
('Luisa Fernandez', 'luisa.fernandez@email.com', '09211234567', '654 Maple Dr, Mandaluyong', 'Administrative Officer III', 'ITEM-001', 'Human Resource Management', true, 'Pending', '2026-01-24'),
('Carlos Mendoza', 'carlos.mendoza@email.com', '09221234567', '987 Cedar Ln, Taguig', 'Administrative Officer III', 'ITEM-001', 'Human Resource Management', false, 'Reviewed', '2026-01-25'),
('Sofia Torres', 'sofia.torres@email.com', '09231234567', '147 Birch Ct, Pasay', 'Administrative Officer III', 'ITEM-001', 'Human Resource Management', false, 'Accepted', '2026-01-26'),
('Miguel Ramos', 'miguel.ramos@email.com', '09241234567', '258 Spruce Way, Las Piñas', 'Administrative Officer III', 'ITEM-001', 'Human Resource Management', false, 'Pending', '2026-01-27'),

-- Insert Sample Applicants for Budget Officer II (5 applicants)
('Elena Gonzales', 'elena.gonzales@email.com', '09251234567', '369 Willow St, Muntinlupa', 'Budget Officer II', 'ITEM-002', 'Finance and Budget', false, 'Pending', '2026-01-20'),
('Ricardo Cruz', 'ricardo.cruz@email.com', '09261234567', '741 Ash Blvd, Parañaque', 'Budget Officer II', 'ITEM-002', 'Finance and Budget', false, 'Reviewed', '2026-01-21'),
('Carmen Lopez', 'carmen.lopez@email.com', '09271234567', '852 Cherry Ave, Caloocan', 'Budget Officer II', 'ITEM-002', 'Finance and Budget', false, 'Pending', '2026-01-22'),
('Antonio Vargas', 'antonio.vargas@email.com', '09281234567', '963 Poplar Rd, Malabon', 'Budget Officer II', 'ITEM-002', 'Finance and Budget', false, 'Pending', '2026-01-23'),
('Isabel Morales', 'isabel.morales@email.com', '09291234567', '159 Cypress Dr, Navotas', 'Budget Officer II', 'ITEM-002', 'Finance and Budget', false, 'Accepted', '2026-01-24'),

-- Insert Sample Applicants for Planning Officer II (12 applicants)
('Roberto Sanchez', 'roberto.sanchez@email.com', '09301234567', '357 Redwood Ln, Valenzuela', 'Planning Officer II', 'ITEM-003', 'Planning and Development', false, 'Pending', '2026-01-20'),
('Teresa Martinez', 'teresa.martinez@email.com', '09311234567', '468 Sequoia Ct, Marikina', 'Planning Officer II', 'ITEM-003', 'Planning and Development', false, 'Reviewed', '2026-01-21'),
('Fernando Castillo', 'fernando.castillo@email.com', '09321234567', '579 Magnolia Way, San Juan', 'Planning Officer II', 'ITEM-003', 'Planning and Development', false, 'Pending', '2026-01-22'),
('Patricia Rivera', 'patricia.rivera@email.com', '09331234567', '680 Palm St, Mandaluyong', 'Planning Officer II', 'ITEM-003', 'Planning and Development', false, 'Pending', '2026-01-23'),
('Domingo Santos', 'domingo.santos@email.com', '09341234567', '791 Walnut Ave, Pasig', 'Planning Officer II', 'ITEM-003', 'Planning and Development', true, 'Reviewed', '2026-01-24'),
('Angelica Flores', 'angelica.flores@email.com', '09351234567', '802 Pecan Rd, Quezon City', 'Planning Officer II', 'ITEM-003', 'Planning and Development', false, 'Pending', '2026-01-25'),
('Gabriel Cruz', 'gabriel.cruz@email.com', '09361234567', '913 Hickory Dr, Manila', 'Planning Officer II', 'ITEM-003', 'Planning and Development', false, 'Pending', '2026-01-26'),
('Rosa Diaz', 'rosa.diaz@email.com', '09371234567', '024 Beech Ln, Makati', 'Planning Officer II', 'ITEM-003', 'Planning and Development', false, 'Reviewed', '2026-01-27'),
('Ernesto Aquino', 'ernesto.aquino@email.com', '09381234567', '135 Sycamore Ct, Taguig', 'Planning Officer II', 'ITEM-003', 'Planning and Development', false, 'Accepted', '2026-01-28'),
('Gloria Pascual', 'gloria.pascual@email.com', '09391234567', '246 Chestnut Way, Pasay', 'Planning Officer II', 'ITEM-003', 'Planning and Development', false, 'Pending', '2026-01-29'),
('Ramon Bautista', 'ramon.bautista@email.com', '09401234567', '357 Dogwood St, Las Piñas', 'Planning Officer II', 'ITEM-003', 'Planning and Development', false, 'Pending', '2026-01-30'),
('Melissa Valdez', 'melissa.valdez@email.com', '09411234567', '468 Juniper Ave, Muntinlupa', 'Planning Officer II', 'ITEM-003', 'Planning and Development', false, 'Pending', '2026-01-31'),

-- Insert Sample Applicants for Information Technology Officer I (15 applicants)
('Christopher Navarro', 'christopher.navarro@email.com', '09421234567', '579 Alder Rd, Parañaque', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', false, 'Pending', '2026-01-20'),
('Diana Aguilar', 'diana.aguilar@email.com', '09431234567', '680 Laurel Dr, Caloocan', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', false, 'Reviewed', '2026-01-21'),
('Eduardo Salazar', 'eduardo.salazar@email.com', '09441234567', '791 Hawthorn Ln, Malabon', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', false, 'Pending', '2026-01-22'),
('Francesca Ramos', 'francesca.ramos@email.com', '09451234567', '802 Cottonwood Ct, Navotas', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', false, 'Pending', '2026-01-23'),
('Gregorio Mendez', 'gregorio.mendez@email.com', '09461234567', '913 Aspen Way, Valenzuela', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', true, 'Reviewed', '2026-01-24'),
('Helena Cruz', 'helena.cruz@email.com', '09471234567', '024 Fir St, Marikina', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', false, 'Pending', '2026-01-25'),
('Ignacio Torres', 'ignacio.torres@email.com', '09481234567', '135 Hemlock Ave, San Juan', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', false, 'Pending', '2026-01-26'),
('Josefa Reyes', 'josefa.reyes@email.com', '09491234567', '246 Linden Rd, Mandaluyong', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', false, 'Reviewed', '2026-01-27'),
('Lorenzo Garcia', 'lorenzo.garcia@email.com', '09501234567', '357 Mulberry Dr, Pasig', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', false, 'Accepted', '2026-01-28'),
('Monica Santos', 'monica.santos@email.com', '09511234567', '468 Sassafras Ln, Quezon City', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', false, 'Pending', '2026-01-29'),
('Nestor Fernandez', 'nestor.fernandez@email.com', '09521234567', '579 Catalpa Ct, Manila', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', false, 'Pending', '2026-01-30'),
('Olivia Mendoza', 'olivia.mendoza@email.com', '09531234567', '680 Locust Way, Makati', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', false, 'Reviewed', '2026-01-31'),
('Pablo Gonzales', 'pablo.gonzales@email.com', '09541234567', '791 Buckeye St, Taguig', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', false, 'Pending', '2026-02-01'),
('Querida Lopez', 'querida.lopez@email.com', '09551234567', '802 Buttonwood Ave, Pasay', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', false, 'Pending', '2026-02-02'),
('Rodrigo Vargas', 'rodrigo.vargas@email.com', '09561234567', '913 Ironwood Rd, Las Piñas', 'Information Technology Officer I', 'ITEM-004', 'ICT Services', false, 'Pending', '2026-02-03'),

-- Insert Sample Applicants for Social Welfare Officer II (6 applicants)
('Sandra Morales', 'sandra.morales@email.com', '09571234567', '024 Boxwood Dr, Muntinlupa', 'Social Welfare Officer II', 'ITEM-005', 'Social Services', false, 'Pending', '2026-01-20'),
('Teodoro Sanchez', 'teodoro.sanchez@email.com', '09581234567', '135 Yew Ln, Parañaque', 'Social Welfare Officer II', 'ITEM-005', 'Social Services', false, 'Reviewed', '2026-01-21'),
('Ursula Martinez', 'ursula.martinez@email.com', '09591234567', '246 Elder Ct, Caloocan', 'Social Welfare Officer II', 'ITEM-005', 'Social Services', false, 'Pending', '2026-01-22'),
('Vicente Castillo', 'vicente.castillo@email.com', '09601234567', '357 Holly Way, Malabon', 'Social Welfare Officer II', 'ITEM-005', 'Social Services', true, 'Pending', '2026-01-23'),
('Wilhelmina Rivera', 'wilhelmina.rivera@email.com', '09611234567', '468 Larch St, Navotas', 'Social Welfare Officer II', 'ITEM-005', 'Social Services', false, 'Reviewed', '2026-01-24'),
('Xavier Santos', 'xavier.santos@email.com', '09621234567', '579 Tamarack Ave, Valenzuela', 'Social Welfare Officer II', 'ITEM-005', 'Social Services', false, 'Accepted', '2026-01-25')
ON CONFLICT DO NOTHING;

-- Verify data was inserted
SELECT 'Jobs inserted:' as info, COUNT(*) as count FROM jobs;
SELECT 'Applicants inserted:' as info, COUNT(*) as count FROM applicants;
