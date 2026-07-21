const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  }
  return acc;
}, {});

const serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5emRmZ3hhYW93anpianB3cmlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5NTcwNywiZXhwIjoyMDg1MjcxNzA3fQ.ZK7i_oUHgJj2cEmDy5UDhLp50BaD_4xo6TJlLJ_iX60";
const supabase = createClient(env.VITE_SUPABASE_URL, serviceKey);

const rawData = `2	Domingo Flores Advincula	domingo.advincula@company.com.ph	0947-858-9935	26 Malakas St., Barangay San Roque, Bacolod City	September 06, 1996	Makati City	29	Male	Single	EMP-2026-9049	Procurement Officer	Finance and Accounting	March 13, 2026	Active	Jose Advincula	Sister	0917-130-2535	dadvincula	noGMbJmT%63
3	Teresita Gonzales Almazan	teresita.almazan@company.com.ph	0919-320-6514	604 Aguinaldo Ave., Barangay San Isidro, Baguio City	November 20, 1977	Dagupan City	48	Female	Widowed	EMP-134	Operations Supervisor	Information Technology	May 16, 2023	Active	Jose Almazan	Mother	0928-199-6881	talmazan	2wMqZcUD%25
4	Cristina Reyes Alonzo	cristina.alonzo@company.com.ph	0917-777-4733	566 Aguinaldo Ave., Barangay San Antonio, Tacloban City	December 23, 1984	Davao City	41	Female	Widowed	EMP-7FA5BA9A	Procurement Officer	Finance and Accounting	January 29, 2023	Active	Luz Alonzo	Mother	0920-987-2654	calonzo	yrDO1xkx#36
5	Manuel Reyes Aquino	manuel.aquino@company.com.ph	0920-267-8573	719 P. Burgos St., Barangay Poblacion, Dasmarinas City	January 23, 1998	Zamboanga City	28	Male	Widowed	EMP-2026-042	Warehouse Staff	Executive Office	March 29, 2026	Active	Elena Aquino	Son	0947-804-4598	maquino	Ru1XXdo0!50
6	Bienvenido Cruz Aragon	bienvenido.aragon@company.com.ph	0947-569-3340	68 del Pilar St., Barangay San Antonio, Naga City	December 29, 1985	Zamboanga City	40	Male	Single	EMP-2026-9036	Marketing Coordinator	Sales and Marketing	December 02, 2026	Active	Luz Aragon	Father	0920-862-9830	baragon	qVLB5Lzx@27
7	Natividad Ramos Ayala	natividad.ayala@company.com.ph	0928-710-2040	94 Kalayaan Ave., Barangay San Isidro, Makati City	November 09, 1990	Butuan City	35	Female	Single	EMP-2026-9041	Human Resources Officer	Quality Assurance	November 18, 2026	Active	Elena Ayala	Sister	0939-579-9669	nayala	qJ38aRUh%44
8	Ernesto Reyes Bacani	ernesto.bacani@company.com.ph	0921-612-3927	115 Aguinaldo Ave., Barangay Bagong Silang, Baguio City	June 23, 2002	Naga City	24	Male	Married	EMP-2026-9033	Procurement Officer	Executive Office	January 02, 2026	Active	Rosa Bacani	Mother	0947-405-9317	ebacani	MmjxWkI9%10
9	Teodoro Reyes Banaag	teodoro.banaag@company.com.ph	0939-180-2403	501 Mabini St., Barangay Poblacion, Tacloban City	November 13, 1994	Naga City	31	Male	Married	EMP-2026-9054	Administrative Assistant	Customer Service	May 03, 2026	Active	Carlos Banaag	Mother	0998-645-3060	tbanaag	iQE8JkqH%64
10	Alfredo Ramos Bernardo	alfredo.bernardo@company.com.ph	0932-629-8397	774 Malakas St., Barangay Malanday, San Fernando, Pampanga	July 02, 1977	Lipa City	49	Male	Married	EMP-2026-009	Finance Analyst	Operations	December 10, 2026	Active	Jose Bernardo	Sibling	0920-165-6539	abernardo	bLJoLoae!39
11	Milagros Fajardo Buenaventura	milagros.buenaventura@company.com.ph	0920-652-3167	881 Luna St., Barangay Poblacion, Tagum City	January 09, 1971	Cebu City	55	Female	Single	EMP-469	Finance Analyst	Warehouse and Logistics	July 25, 2022	Active	Miguel Buenaventura	Brother	0920-903-8749	mbuenaventura	ZAmggQBw$62
12	Editha Ramos Cabrera	editha.cabrera@company.com.ph	0920-296-4116	690 Ilang-Ilang St., Barangay Poblacion, Cebu City	December 12, 1988	Cebu City	37	Female	Married	EMP-2026-010	Records Officer	Finance and Accounting	June 23, 2026	Active	Rosa Cabrera	Brother	0919-532-4006	ecabrera	rDp37eCZ%22
13	Feliciano Reyes Cojuangco	feliciano.cojuangco@company.com.ph	0920-985-7570	857 Mabini St., Barangay Poblacion, Bacolod City	April 08, 1970	Lipa City	56	Male	Single	EMP-2026-9044	Marketing Coordinator	Warehouse and Logistics	July 28, 2026	Active	Maria Cojuangco	Father	0928-102-7396	fcojuangco	q7YYDsBS%94
14	Josefina Pascual Concepcion	josefina.concepcion@company.com.ph	0917-151-8811	159 del Pilar St., Barangay San Roque, Cagayan de Oro	March 23, 2000	Butuan City	26	Female	Single	EMP-131	Procurement Officer	Operations	May 05, 2021	Active	Rosa Concepcion	Father	0917-620-2312	jconcepcion	2leMeR3p$25
15	Perla Rivera Custodio	perla.custodio@company.com.ph	0939-635-6183	593 Sampaguita St., Barangay San Isidro, Dasmarinas City	July 21, 1993	Bacolod City	33	Female	Single	EMP-2026-8997	Finance Analyst	Records Management	August 03, 2026	Active	Luz Custodio	Sibling	0947-833-6147	pcustodio	pqziQPtD#19
16	Ronald Mcdonald Dela Rosa	ronald.rosa@company.com.ph	0919-457-2127	637 Sampaguita St., Barangay Poblacion, Davao City	June 01, 1968	Dagupan City	58	Male	Widowed	EMP-2026-2855	Warehouse Staff	Information Technology	April 20, 2026	Active	Pedro Rosa	Daughter	0921-261-8179	rrosa	1ITtNZPH!95
17	Antonio Cruz Delgado	antonio.delgado@company.com.ph	0975-666-3546	955 Ilang-Ilang St., Barangay Poblacion, Iloilo City	November 16, 1992	San Fernando, Pampanga	33	Male	Married	EMP-2026-002	Executive Secretary	Finance and Accounting	March 01, 2026	Active	Luz Delgado	Son	0939-315-6617	adelgado	nRO2qGFq!21
18	Corazon Villar Enriquez	corazon.enriquez@company.com.ph	0919-859-8239	850 Aguinaldo Ave., Barangay San Isidro, Quezon City	June 14, 1996	Legazpi City	30	Female	Married	EMP-193	Finance Analyst	Information Technology	September 25, 2021	Active	Rosa Enriquez	Sister	0933-109-2832	cenriquez	e84S5jIc#84
19	Purita Santos Escudero	purita.escudero@company.com.ph	0920-798-5088	441 Bonifacio St., Barangay San Isidro, San Fernando, Pampanga	October 13, 1992	Iloilo City	33	Female	Married	EMP-2026-9037	Executive Secretary	Operations	January 21, 2026	Active	Jose Escudero	Daughter	0998-673-7658	pescudero	NVj77p3k@62
20	Danilo Torres Espinosa	danilo.espinosa@company.com.ph	0998-818-2771	755 P. Burgos St., Barangay Sta. Cruz, Legazpi City	February 10, 1969	Baguio City	57	Male	Widowed	EMP-2026-001	IT Support Specialist	Human Resources	May 08, 2026	Active	Elena Espinosa	Spouse	0932-327-4269	despinosa	06Dwt0Y3@38
21	Marilou Santos Ferrer	marilou.ferrer@company.com.ph	0928-795-9785	409 Luna St., Barangay San Roque, Davao City	January 22, 1969	Cagayan de Oro	57	Female	Married	EMP-2024-000	Finance Analyst	Procurement	June 28, 2024	Active	Ramon Ferrer	Spouse	0918-998-5279	mferrer	lL9qcgMB#50
22	Restituto Reyes Gatchalian	restituto.gatchalian@company.com.ph	0928-101-9518	524 Rizal Ave., Barangay Bagong Silang, Antipolo City	July 29, 1987	Dasmarinas City	38	Male	Single	EMP-2026-9048	Administrative Assistant	Executive Office	May 11, 2026	Active	Rosa Gatchalian	Sibling	0927-541-2146	rgatchalian	8Q6vNuQ2!48
23	Cesar Villanueva Guevarra	cesar.guevarra@company.com.ph	0920-530-7211	683 Quezon Ave., Barangay Sta. Cruz, Batangas City	September 30, 1990	San Fernando, Pampanga	35	Male	Widowed	EMP-2026-5922	Warehouse Staff	Human Resources	June 01, 2026	Active	Ana Guevarra	Son	0928-661-1006	cguevarra	tsnBYLMP#69
24	Marcelo Cruz Ilagan	marcelo.ilagan@company.com.ph	0921-627-6491	692 del Pilar St., Barangay Guadalupe, Butuan City	October 26, 1987	Dagupan City	38	Male	Widowed	EMP-2026-9053	Finance Analyst	Finance and Accounting	March 28, 2026	Active	Jose Ilagan	Sibling	0947-417-4680	milagan	ZmjbcpEN!68
25	Amelia Roxas Katigbak	amelia.katigbak@company.com.ph	0975-105-2746	200 Malakas St., Barangay Bagong Silang, Butuan City	August 04, 1986	Antipolo City	39	Female	Married	EMP-2026-9034	Human Resources Officer	Quality Assurance	May 05, 2026	Active	Elena Katigbak	Sibling	0919-923-9486	akatigbak	DdJp62hD@69
26	Aurora Flores Lacson	aurora.lacson@company.com.ph	0932-262-8777	573 Sampaguita St., Barangay Sta. Cruz, Dagupan City	December 11, 1997	Tagum City	28	Female	Widowed	EMP-2026-6802	Sales Associate	Procurement	September 16, 2026	Active	Carlos Lacson	Son	0998-353-5543	alacson	XXHFOprC!46
27	Vicente Aquino Lazaro	vicente.lazaro@company.com.ph	0975-256-4505	344 Luna St., Barangay Guadalupe, Davao City	July 08, 1978	Zamboanga City	48	Male	Single	EMP-2026-9045	Customer Service Representative	Sales and Marketing	March 19, 2026	Active	Jose Lazaro	Sister	0928-438-9890	vlazaro	DAdn1Ay5%99
28	Alberto Garcia Ledesma	alberto.ledesma@company.com.ph	0933-865-9947	390 Magsaysay Blvd., Barangay San Isidro, Tacloban City	November 16, 1968	Antipolo City	57	Male	Married	EMP-2026-9040	Quality Assurance Staff	Sales and Marketing	July 19, 2026	Active	Miguel Ledesma	Sibling	0932-324-5471	aledesma	BFbyvQRZ$31
29	Ramon Dizon Macapagal	ramon.macapagal@company.com.ph	0918-758-8022	638 Burgos St., Barangay San Isidro, Batangas City	December 18, 1988	Iloilo City	37	Male	Widowed	EMP-2026-018	Finance Analyst	Administration	October 16, 2026	Active	Ana Macapagal	Brother	0919-151-5262	rmacapagal	yunDuvW4$45
30	Erlinda Bautista Magsaysay	erlinda.magsaysay@company.com.ph	0947-170-1659	259 Maharlika Highway, Barangay Poblacion, Butuan City	September 24, 2001	Legazpi City	24	Female	Single	EMP-133	Operations Supervisor	Customer Service	April 17, 2021	Active	Maria Magsaysay	Sibling	0920-959-1333	emagsaysay	NjpiEQhK@69
31	Victoria Santos Manalo	victoria.manalo@company.com.ph	0921-210-1420	786 Luna St., Barangay Santo Nino, Dasmarinas City	May 18, 1999	Zamboanga City	27	Female	Widowed	EMP-2026-9032	Records Officer	Human Resources	February 28, 2026	Active	Luz Manalo	Sister	0928-832-4249	vmanalo	eLS1OpgS#97
32	Rogelio Castro Mationg	rogelio.mationg@company.com.ph	0918-618-6590	816 Sampaguita St., Barangay San Isidro, Tacloban City	December 07, 1994	Makati City	31	Male	Widowed	EMP-09CC4879	Finance Analyst	Operations	May 27, 2024	Active	Maria Mationg	Sister	0932-208-8102	rmationg	9xO51DTj$32
33	Leonardo Aquino Mendoza	leonardo.mendoza@company.com.ph	0975-706-5397	989 Ilang-Ilang St., Barangay San Roque, Dasmarinas City	November 30, 2000	Tagum City	25	Male	Widowed	EMP-2026-008	Marketing Coordinator	Sales and Marketing	September 05, 2026	Active	Ramon Mendoza	Sibling	0918-385-8385	lmendoza	pWDKNQyv!73
34	Eduardo Santos Mercado	eduardo.mercado@company.com.ph	0975-382-1166	500 del Pilar St., Barangay Sta. Cruz, Zamboanga City	July 31, 1982	Baguio City	43	Male	Married	EMP-2026-005	Executive Secretary	Records Management	May 24, 2026	Active	Rosa Mercado	Sibling	0918-347-7658	emercado	FJWpSEPT$67
35	Salvador Reyes Montenegro	salvador.montenegro@company.com.ph	0932-666-9698	302 del Pilar St., Barangay Bagong Silang, Bacolod City	October 09, 1968	Davao City	57	Male	Married	EMP-2026-9038	Logistics Officer	Operations	December 06, 2026	Active	Ramon Montenegro	Sister	0975-663-6419	smontenegro	wSDrtqoh@50
36	Arturo Domingo Ocampo	arturo.ocampo@company.com.ph	0939-878-9595	974 Kalayaan Ave., Barangay Santo Nino, Cagayan de Oro	May 12, 1973	Lipa City	53	Male	Single	EMP-132	IT Support Specialist	Executive Office	September 19, 2023	Active	Miguel Ocampo	Son	0918-952-4180	aocampo	soxltaTI@45
37	Angel Locsin Ocana	angel.ocana@company.com.ph	0932-590-8216	567 Aguinaldo Ave., Barangay Santo Nino, Butuan City	January 15, 1970	Cebu City	56	Male	Single	EMP-2026-8746	Logistics Officer	Information Technology	January 07, 2026	Active	Ramon Ocana	Father	0917-358-8827	aocana	h0ezFeKO!29
38	Angelika Jean Jungco Ocana	angelika.ocana@company.com.ph	0939-710-4697	972 Aguinaldo Ave., Barangay Poblacion, Bacolod City	September 10, 1974	Antipolo City	51	Female	Single	EMP-2026-1395	Records Officer	Sales and Marketing	October 13, 2026	Active	Rosa Ocana	Sister	0932-553-5871	ajocana	3LBtKNdN!36
39	Dolores Cruz Osmena	dolores.osmena@company.com.ph	0919-102-7693	271 Ilang-Ilang St., Barangay Poblacion, Baguio City	January 22, 1996	Cagayan de Oro	30	Female	Single	EMP-2026-9043	Warehouse Staff	Finance and Accounting	March 30, 2026	Active	Carlos Osmena	Brother	0921-133-4792	dosmena	sTsS3DeR@43
40	Honorio Santos Padilla	honorio.padilla@company.com.ph	0919-372-3330	678 Kalayaan Ave., Barangay Malanday, Legazpi City	January 14, 1996	Antipolo City	30	Male	Single	EMP-2026-9047	Customer Service Representative	Quality Assurance	October 06, 2026	Active	Jose Padilla	Spouse	0919-911-6039	hpadilla	MV0K6sCh$98
41	Rodolfo Cruz Palanca	rodolfo.palanca@company.com.ph	0917-542-6280	966 Aguinaldo Ave., Barangay Guadalupe, Lipa City	August 22, 1981	Batangas City	44	Male	Married	EMP-2026-9031	Accounting Staff	Records Management	August 13, 2026	Active	Miguel Palanca	Son	0917-193-4750	rpalanca	9R13KL8b#83
42	Fernando Garcia Panganiban	fernando.panganiban@company.com.ph	0932-193-8700	482 Burgos St., Barangay San Jose, Zamboanga City	October 21, 1969	Baguio City	56	Male	Single	EMP-2026-006	Sales Associate	Quality Assurance	October 27, 2026	Active	Ramon Panganiban	Sister	0927-428-2713	fpanganiban	2kvASFsQ$80
43	Jean Francois Pierre	jean.pierre@company.com.ph	0917-773-9889	91 Luna St., Barangay San Roque, Naga City	August 24, 1969	Dagupan City	56	Male	Single	EMP-2026-9056	Quality Assurance Staff	Procurement	July 26, 2026	Active	Carlos Pierre	Sister	0917-292-9494	jpierre	xNWFOCWd@44
44	Imelda Bonifacio Pineda	imelda.pineda@company.com.ph	0998-345-3594	950 Aguinaldo Ave., Barangay San Jose, Butuan City	August 20, 1992	Iloilo City	33	Female	Single	EMP-2026-013	Finance Analyst	Records Management	January 15, 2026	Active	Luz Pineda	Spouse	0933-517-2527	ipineda	o16hD8hP@73
45	Nestor Santos Quintos	nestor.quintos@company.com.ph	0933-248-7284	522 Malakas St., Barangay San Roque, Legazpi City	February 22, 2000	San Fernando, Pampanga	26	Male	Married	EMP-2026-9052	Customer Service Representative	Warehouse and Logistics	August 30, 2026	Active	Pedro Quintos	Father	0918-382-7798	nquintos	v7YGr0as#85
46	Lourdes Aguilar Rosales	lourdes.rosales@company.com.ph	0998-656-7180	887 Bonifacio St., Barangay San Jose, Lipa City	January 05, 1994	Butuan City	32	Female	Married	EMP-130	Operations Supervisor	Procurement	December 08, 2022	Active	Carlos Rosales	Daughter	0920-814-4912	lrosales	Kyo2XAcu$58
47	Isagani Cruz Rustia	isagani.rustia@company.com.ph	0932-202-9617	508 Mabini St., Barangay Santo Nino, Tagum City	April 26, 1985	Iloilo City	41	Male	Widowed	EMP-2026-9046	Quality Assurance Staff	Finance and Accounting	June 19, 2026	Active	Carlos Rustia	Spouse	0975-247-7717	irustia	3PjeEYqv%98
48	Roberto Flores Salazar	roberto.salazar@company.com.ph	0933-136-2121	873 Luna St., Barangay Guadalupe, Batangas City	October 30, 1985	Davao City	40	Male	Married	EMP-2026-007	Procurement Officer	Warehouse and Logistics	November 17, 2026	Active	Pedro Salazar	Son	0920-864-2480	rsalazar	BgWOT3gC@98
49	Pedro Villanueva Samonte	pedro.samonte@company.com.ph	0920-643-7751	48 Luna St., Barangay San Isidro, San Fernando, Pampanga	June 07, 1981	Quezon City	45	Male	Married	EMP-2026-9055	Sales Associate	Human Resources	July 11, 2026	Active	Miguel Samonte	Father	0919-279-2293	psamonte	N3yNRpF6%28
50	Wilfredo Navarro Sarmiento	wilfredo.sarmiento@company.com.ph	0921-793-9955	654 Aguinaldo Ave., Barangay San Jose, Zamboanga City	June 01, 1978	Dagupan City	48	Male	Widowed	EMP-2024-001	Executive Secretary	Warehouse and Logistics	January 05, 2024	Active	Ana Sarmiento	Mother	0932-453-5901	wsarmiento	O9BSqD2t@59
51	Rafael Lim Sionil	rafael.sionil@company.com.ph	0917-949-7484	243 Quezon Ave., Barangay San Antonio, Tacloban City	September 03, 1989	Makati City	36	Male	Widowed	EMP-2026-9035	Procurement Officer	Information Technology	June 01, 2026	Active	Luz Sionil	Spouse	0939-985-1803	rsionil	6MVF155s@87
52	Emmanuel Garcia Sison	emmanuel.sison@company.com.ph	0947-199-1645	652 del Pilar St., Barangay San Antonio, Zamboanga City	October 21, 1983	Bacolod City	42	Male	Widowed	EMP-2026-9050	Finance Analyst	Human Resources	December 04, 2026	Active	Luz Sison	Brother	0917-693-6977	esison	Uif6suVA@35
53	Nenita Garcia Tolentino	nenita.tolentino@company.com.ph	0998-402-6549	898 Luna St., Barangay Guadalupe, Tagum City	December 05, 1973	Lipa City	52	Female	Married	EMP-2026-014	IT Support Specialist	Warehouse and Logistics	March 26, 2026	Active	Jose Tolentino	Brother	0918-244-4696	ntolentino	3RURz92Z%56
54	Bayani Ramos Trinidad	bayani.trinidad@company.com.ph	0947-368-7242	15 Aguinaldo Ave., Barangay Guadalupe, Makati City	January 19, 1972	Batangas City	54	Male	Married	EMP-2026-9051	Finance Analyst	Executive Office	July 08, 2026	Active	Ramon Trinidad	Mother	0947-339-8724	btrinidad	bN48Ju6N@92
55	Remedios Cruz Valdez	remedios.valdez@company.com.ph	0921-604-2902	932 Malakas St., Barangay San Roque, Legazpi City	November 01, 1970	Dagupan City	55	Female	Single	EMP-F0156D31	Administrative Assistant	Administration	October 14, 2022	Active	Jose Valdez	Sibling	0933-238-7367	rvaldez	DxQ8VS8I$85
56	Ricardo Bautista Villanueva	ricardo.villanueva@company.com.ph	0975-479-4559	907 Quezon Ave., Barangay Poblacion, Butuan City	April 18, 2001	Iloilo City	25	Male	Widowed	EMP-2026-040	IT Support Specialist	Administration	July 28, 2026	Active	Carlos Villanueva	Brother	0920-975-6942	rvillanueva	gRxI5Pwd$45
57	Gloria Estrada Villaroman	gloria.villaroman@company.com.ph	0939-121-1828	972 Maharlika Highway, Barangay San Jose, Davao City	July 06, 1976	Makati City	50	Female	Widowed	EMP-2026-8963	Finance Analyst	Quality Assurance	April 19, 2026	Active	Ramon Villaroman	Sibling	0919-905-4362	gvillaroman	e1WJnLn0@52
58	Concepcion Flores Yulo	concepcion.yulo@company.com.ph	0921-917-3858	808 P. Burgos St., Barangay San Antonio, Quezon City	September 26, 2002	Iloilo City	23	Female	Married	EMP-2026-9039	Human Resources Officer	Procurement	March 16, 2026	Active	Jose Yulo	Spouse	0919-115-6869	cyulo	YYpLublq!26
59	Benjamin Ocampo Zamora	benjamin.zamora@company.com.ph	0939-211-8405	539 Rizal Ave., Barangay Poblacion, Butuan City	April 09, 2001	Legazpi City	25	Male	Married	EMP-2238FD0D	Operations Supervisor	Procurement	May 13, 2026	Active	Rosa Zamora	Sibling	0939-144-9543	bzamora	tDP9bdE2$64
60	Gregorio Santos Zulueta	gregorio.zulueta@company.com.ph	0918-229-5505	503 Malakas St., Barangay San Jose, Davao City	October 11, 1998	Makati City	27	Male	Single	EMP-2026-9042	Logistics Officer	Human Resources	June 14, 2026	Active	Miguel Zulueta	Daughter	0928-711-9692	gzulueta	sDGMBgYS!93`;

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12'
};

function parseDateString(str) {
  if (!str) return null;
  const clean = str.trim().replace(/,/g, '');
  const parts = clean.split(/\s+/);
  if (parts.length !== 3) return null;
  
  const month = MONTHS[parts[0].toLowerCase()];
  const day = parts[1].padStart(2, '0');
  const year = parts[2];
  
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

function splitFullName(fullName) {
  fullName = fullName.trim();
  if (fullName === "Ronald Mcdonald Dela Rosa") {
    return { first: "Ronald", middle: "Mcdonald", last: "Dela Rosa" };
  }
  if (fullName === "Angelika Jean Jungco Ocana") {
    return { first: "Angelika Jean", middle: "Jungco", last: "Ocana" };
  }
  if (fullName === "Jean Francois Pierre") {
    return { first: "Jean", middle: "Francois", last: "Pierre" };
  }
  
  const parts = fullName.split(/\s+/);
  if (parts.length === 3) {
    return { first: parts[0], middle: parts[1], last: parts[2] };
  }
  if (parts.length === 2) {
    return { first: parts[0], middle: "", last: parts[1] };
  }
  return { first: parts[0], middle: parts.slice(1, -1).join(" "), last: parts[parts.length - 1] };
}

async function run() {
  const lines = rawData.trim().split('\n');
  console.log(`Parsed ${lines.length} lines of employee data. Starting update...`);
  
  for (const line of lines) {
    const fields = line.split('\t');
    if (fields.length < 19) {
      console.warn(`Line skip due to insufficient fields: ${line}`);
      continue;
    }
    
    const [
      id,
      fullName,
      email,
      phone,
      address,
      dobStr,
      pob,
      age,
      sex,
      civilStatus,
      empNumber,
      position,
      department,
      hiredStr,
      empStatus,
      emergencyContact,
      emergencyRelationship,
      emergencyPhone,
      username,
      password
    ] = fields.map(f => f.trim());

    const names = splitFullName(fullName);
    const dob = parseDateString(dobStr);
    const dateHired = parseDateString(hiredStr);

    console.log(`Processing employee ${empNumber}: ${fullName}`);

    // 1. Get or create portal account
    const { data: accByEmpId } = await supabase
      .from('employee_portal_accounts')
      .select('*')
      .eq('employee_id', empNumber)
      .maybeSingle();

    const { data: accByUsername } = await supabase
      .from('employee_portal_accounts')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    const matchedAccount = accByEmpId || accByUsername;
    const accountId = matchedAccount ? matchedAccount.id : `portal-${empNumber}`;

    if (matchedAccount) {
      const { error: updateAccErr } = await supabase
        .from('employee_portal_accounts')
        .update({
          username: username,
          password: password,
          employee_id: empNumber,
          full_name: fullName,
          email: email,
          mobile_number: phone,
          updated_at: new Date().toISOString()
        })
        .eq('id', matchedAccount.id);
      
      if (updateAccErr) {
        console.error(`❌ Error updating portal account for ${empNumber}:`, updateAccErr);
      } else {
        console.log(`✅ Updated portal account for ${empNumber} (ID: ${matchedAccount.id})`);
      }
    } else {
      const { error: insertAccErr } = await supabase
        .from('employee_portal_accounts')
        .insert({
          id: accountId,
          username: username,
          password: password,
          employee_id: empNumber,
          full_name: fullName,
          email: email,
          mobile_number: phone,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (insertAccErr) {
        console.error(`❌ Error inserting portal account for ${empNumber}:`, insertAccErr);
      } else {
        console.log(`✅ Created new portal account for ${empNumber} (ID: ${accountId})`);
      }
    }

    // 2. Update employee record in employees table
    const { data: existingEmp, error: fetchEmpErr } = await supabase
      .from('employees')
      .select('id')
      .eq('employee_number', empNumber)
      .maybeSingle();

    if (fetchEmpErr) {
      console.error(`❌ Error fetching employee record for ${empNumber}:`, fetchEmpErr);
      continue;
    }

    if (!existingEmp) {
      console.warn(`⚠️ Employee record for ${empNumber} not found in employees table!`);
      continue;
    }

    const { error: updateEmpErr } = await supabase
      .from('employees')
      .update({
        first_name: names.first,
        middle_name: names.middle,
        last_name: names.last,
        email: email,
        phone: phone,
        current_address_street: address,
        permanent_address_street: address,
        date_of_birth: dob,
        place_of_birth: pob,
        sex: sex,
        civil_status: civilStatus,
        position: position,
        department: department,
        date_hired: dateHired,
        status: 'Active',
        employment_status: 'Regular',
        emergency_contact_name: emergencyContact,
        emergency_contact_relationship: emergencyRelationship,
        emergency_contact_phone: emergencyPhone,
        modified_at: new Date().toISOString()
      })
      .eq('id', existingEmp.id);

    if (updateEmpErr) {
      console.error(`❌ Error updating employee table for ${empNumber}:`, updateEmpErr);
    } else {
      console.log(`✅ Updated employees table for ${empNumber} (${fullName})`);
    }
  }

  console.log("All updates completed.");
}

run();
