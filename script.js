/**
 * Depreciation Schedule Calculator - Full JavaScript Code
 * Contains all features including automatic recalculation, PDF export,
 * and UI/UX enhancements as of August 21, 2025.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Global State ---
    let scheduleData = [];
    let calculationInputs = {};
    let hasCalculatedOnce = false;

    // --- Setup Event Listeners ---
    document.getElementById('depreciation-form').addEventListener('submit', calculateDepreciationSchedule);
    document.getElementById('clear-btn').addEventListener('click', clearAll);
    document.getElementById('scrap-type').addEventListener('change', handleScrapTypeChange);
    document.getElementById('pdf-btn').addEventListener('click', generatePDF);
    document.getElementById('analysis-date').addEventListener('change', calculateValueAtDate);

    // Add listeners to all parameters for automatic recalculation after the first run
    const inputsToTrack = ['asset-cost', 'purchase-date', 'useful-life', 'depreciation-method', 'scrap-type', 'scrap-value'];
    inputsToTrack.forEach(inputId => {
        document.getElementById(inputId).addEventListener('change', handleAutoUpdate);
    });

    // --- Initialize Form ---
    initializeDates();
    document.getElementById('pdf-btn').disabled = true;

    // --- CORE FUNCTIONS ---

    function calculateDepreciationSchedule(event) {
        if (event) {
            event.preventDefault();
        }

        const inputs = getAndValidateInputs();
        if (!inputs) {
            return;
        }

        hasCalculatedOnce = true;
        calculationInputs = inputs;
        const { cost, purchaseDate, life, scrapValue, method } = inputs;

        let currentWdv = cost;
        scheduleData = [];
        let yearCounter = 0;
        const depreciableBase = cost - scrapValue;
        const assetEndDate = new Date(purchaseDate);
        assetEndDate.setFullYear(assetEndDate.getFullYear() + life);
        const wdvRate = 1 - Math.pow(scrapValue / cost, 1 / life);

        while (currentWdv > scrapValue && Math.abs(currentWdv - scrapValue) > 0.01) {
            yearCounter++;
            const { fyStartDate, fyEndDate, fyString } = getFinancialYear(purchaseDate, yearCounter);
            const isFinalYear = assetEndDate <= fyEndDate;
            const effectiveEndDateForDep = isFinalYear ? assetEndDate : fyEndDate;

            if (fyStartDate > effectiveEndDateForDep) break;

            let openingWdv = currentWdv;
            const daysInStandardYear = isLeapYear(fyEndDate.getUTCFullYear()) ? 366 : 365;
            const effectiveStartDateForDep = (yearCounter === 1) ? purchaseDate : fyStartDate;
            const proRataDays = (effectiveEndDateForDep - effectiveStartDateForDep) / (1000 * 3600 * 24) + 1;

            let annualDepreciationRate;
            if (method === 'SLM') {
                annualDepreciationRate = depreciableBase / life;
            } else {
                annualDepreciationRate = openingWdv * wdvRate;
            }

            let yearlyDepreciation = (annualDepreciationRate / daysInStandardYear) * Math.max(0, proRataDays);

            if (isFinalYear || (openingWdv - yearlyDepreciation) < scrapValue) {
                yearlyDepreciation = openingWdv - scrapValue;
            }

            const closingWdv = openingWdv - yearlyDepreciation;
            const quarterlyDep = calculateQuarterlyBreakdown(yearlyDepreciation, effectiveStartDateForDep, effectiveEndDateForDep, fyStartDate);

            scheduleData.push({ fy: fyString, openingWdv, yearlyDepreciation, q1: quarterlyDep.q1, q2: quarterlyDep.q2, q3: quarterlyDep.q3, q4: quarterlyDep.q4, closingWdv });
            currentWdv = closingWdv;
            if (isFinalYear) break;
        }

        displaySchedule(scheduleData);
        calculateValueAtDate();
        document.getElementById('pdf-btn').disabled = false;
    }

    function calculateValueAtDate() {
        const inputs = getAndValidateInputs();
        if (!inputs) return;

        const analysisDate = new Date(document.getElementById('analysis-date').value + 'T00:00:00Z');
        if (!analysisDate.getTime()) {
            alert("Please select a valid date for analysis.");
            return;
        }

        if (analysisDate < inputs.purchaseDate) {
            displayAnalysisResult(0, inputs.cost, analysisDate, true);
            return;
        }

        let accumulatedDep = 0;
        const { cost, purchaseDate, life, scrapValue, method } = inputs;
        const depreciableBase = cost - scrapValue;
        const wdvRate = 1 - Math.pow(scrapValue / cost, 1 / life);
        let wdv = cost;

        for (let i = 0; i < life; i++) {
            const yearStartDate = new Date(purchaseDate);
            yearStartDate.setFullYear(purchaseDate.getFullYear() + i);
            const yearEndDate = new Date(purchaseDate);
            yearEndDate.setFullYear(purchaseDate.getFullYear() + i + 1);

            if (yearStartDate > analysisDate) break;

            const daysInYear = isLeapYear(yearEndDate.getUTCFullYear()) ? 366 : 365;
            let depForYear;
            if (method === 'SLM') {
                depForYear = depreciableBase / life;
            } else {
                depForYear = wdv * wdvRate;
            }

            const dailyDep = depForYear / daysInYear;
            const periodStartDate = (i === 0) ? purchaseDate : yearStartDate;
            const periodEndDate = (analysisDate < yearEndDate) ? analysisDate : yearEndDate;
            const daysToDepreciate = (periodEndDate - periodStartDate) / (1000 * 3600 * 24) + 1;

            if (daysToDepreciate > 0) {
                const depreciationThisPeriod = dailyDep * daysToDepreciate;
                accumulatedDep += depreciationThisPeriod;
                wdv -= depreciationThisPeriod;
            }

            if (wdv < scrapValue) {
                accumulatedDep -= (scrapValue - wdv);
                wdv = scrapValue;
                break;
            }
        }

        displayAnalysisResult(accumulatedDep, wdv, analysisDate);
    }

    function generatePDF() {
        if (scheduleData.length === 0 || !calculationInputs.cost) {
            alert("Please calculate a schedule first.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const { assetName, cost, purchaseDate, life, scrapValue, method } = calculationInputs;

        doc.setFontSize(20);
        doc.text("Depreciation Schedule Report", 105, 20, { align: 'center' });
        doc.setFontSize(12);
        doc.text(`Asset: ${assetName}`, 105, 30, { align: 'center' });

        const summaryBody = [
            ['Cost of Asset:', `₹ ${formatCurrencyIN(cost)}`],
            ['Date of Purchase:', purchaseDate.toLocaleDateString('en-GB')],
            ['Useful Life:', `${life} Years`],
            ['Scrap Value:', `₹ ${formatCurrencyIN(scrapValue)}`],
            ['Depreciation Method:', method],
        ];

        doc.autoTable({
            startY: 40,
            head: [['Parameter', 'Value']],
            body: summaryBody,
            theme: 'striped',
            headStyles: { fillColor: [94, 70, 28] }
        });

        const tableHead = ['Financial Year', 'Opening WDV', 'Q1 Dep.', 'Q2 Dep.', 'Q3 Dep.', 'Q4 Dep.', 'Annual Dep.', 'Closing WDV'];
        const tableBody = scheduleData.map(row => [
            row.fy, formatCurrencyIN(row.openingWdv), formatCurrencyIN(row.q1), formatCurrencyIN(row.q2),
            formatCurrencyIN(row.q3), formatCurrencyIN(row.q4), formatCurrencyIN(row.yearlyDepreciation), formatCurrencyIN(row.closingWdv)
        ]);

        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 15,
            head: [tableHead],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [150, 112, 44] }
        });

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(10);
            const footerText = `Report generated on: ${new Date().toLocaleDateString('en-GB')}`;
            const pageNumText = `Page ${i} of ${pageCount}`;
            doc.text(footerText, 14, doc.internal.pageSize.height - 10);
            doc.text(pageNumText, 200, doc.internal.pageSize.height - 10, { align: 'right' });
        }

        const fileName = `Depreciation_Schedule_${assetName.replace(/ /g, '_')}.pdf`;
        doc.save(fileName);
    }

    // --- HELPER & EVENT HANDLER FUNCTIONS ---

    function handleAutoUpdate() {
        if (hasCalculatedOnce) {
            document.getElementById('depreciation-form').requestSubmit();
        }
    }

    function handleScrapTypeChange() {
        const scrapValueInput = document.getElementById('scrap-value');
        const scrapValueLabel = document.getElementById('scrap-value-label');
        if (this.value === 'percentage') {
            scrapValueLabel.textContent = 'Scrap Value (%)';
            scrapValueInput.value = '5';
            scrapValueInput.max = '100';
        } else {
            scrapValueLabel.textContent = 'Scrap Value (₹)';
            const cost = parseFloat(document.getElementById('asset-cost').value) || 0;
            scrapValueInput.value = (cost * 0.05).toFixed(0);
            scrapValueInput.max = '';
        }
    }

    function getAndValidateInputs() {
        const cost = parseFloat(document.getElementById('asset-cost').value);
        const purchaseDate = new Date(document.getElementById('purchase-date').value + 'T00:00:00Z');
        const life = parseInt(document.getElementById('useful-life').value);
        const method = document.getElementById('depreciation-method').value;
        const assetName = document.getElementById('asset-name').value || "Unnamed Asset";
        const scrapType = document.getElementById('scrap-type').value;
        let scrapValueInput = parseFloat(document.getElementById('scrap-value').value);
        let scrapValue;

        if (scrapType === 'percentage') {
            scrapValue = cost * (scrapValueInput / 100);
        } else {
            scrapValue = scrapValueInput;
        }

        if ([cost, life, scrapValue].some(isNaN) || !purchaseDate.getTime()) {
            alert('Please fill all fields with valid numbers and dates.');
            return null;
        }
        if (scrapValue >= cost) {
            alert('Scrap value must be less than the asset cost.');
            return null;
        }

        return { cost, purchaseDate, life, scrapValue, method, assetName };
    }

    function clearAll() {
        document.getElementById('depreciation-form').reset();
        document.getElementById('scrap-type').value = 'absolute';
        handleScrapTypeChange.call({ value: 'absolute' });
        initializeDates();
        document.getElementById('results-container').innerHTML = '';
        document.getElementById('analysis-result').style.display = 'none';
        scheduleData = [];
        calculationInputs = {};
        hasCalculatedOnce = false;
        document.getElementById('pdf-btn').disabled = true;
    }

    // --- DISPLAY & UI FUNCTIONS ---

    function displaySchedule(schedule) {
        const container = document.getElementById('results-container');
        container.innerHTML = '<h2>Depreciation Schedule</h2>';

        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'table-scroll-wrapper';

        let tableHTML = `<table class="results-table" id="depreciation-table"><thead><tr><th rowspan="2">Financial Year</th><th rowspan="2">Opening WDV</th><th colspan="4">Quarterly Depreciation</th><th rowspan="2">Total Annual Depreciation</th><th rowspan="2">Closing WDV</th></tr><tr><th>Q1 (Apr-Jun)</th><th>Q2 (Jul-Sep)</th><th>Q3 (Oct-Dec)</th><th>Q4 (Jan-Mar)</th></tr></thead><tbody>`;

        schedule.forEach(row => {
            tableHTML += `<tr class="fy-total-row"><td class="col-fy">${row.fy}</td><td>${formatCurrencyIN(row.openingWdv)}</td><td>${formatCurrencyIN(row.q1)}</td><td>${formatCurrencyIN(row.q2)}</td><td>${formatCurrencyIN(row.q3)}</td><td>${formatCurrencyIN(row.q4)}</td><td>${formatCurrencyIN(row.yearlyDepreciation)}</td><td>${formatCurrencyIN(row.closingWdv)}</td></tr>`;
        });

        tableHTML += `</tbody></table>`;
        tableWrapper.innerHTML = tableHTML;
        container.appendChild(tableWrapper);
    }

    function displayAnalysisResult(accumulatedDep, wdv, date, isError = false) {
        const resultBox = document.getElementById('analysis-result');
        resultBox.style.display = 'block';

        if (isError) {
            resultBox.innerHTML = `<p>Analysis date cannot be before the purchase date.</p>`;
            return;
        }

        resultBox.innerHTML = `<p>As on <strong>${date.toLocaleDateString('en-GB')}</strong>:</p><p>Accumulated Depreciation: <strong>₹ ${formatCurrencyIN(accumulatedDep)}</strong></p><p>Closing WDV: <strong>₹ ${formatCurrencyIN(wdv)}</strong></p>`;
    }

    function initializeDates() {
        const today = new Date();
        document.getElementById('purchase-date').value = today.toISOString().split('T')[0];

        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // 0-indexed (Jan=0, Apr=3)
        let analysisYear = (currentMonth >= 3) ? currentYear + 1 : currentYear;

        const year = analysisYear;
        const month = String(3).padStart(2, '0'); // March
        const day = String(31).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;
        document.getElementById('analysis-date').value = formattedDate;
    }

    // --- UTILITY FUNCTIONS ---

    const formatCurrencyIN = (num) => {
        if (typeof num !== 'number' || num === 0) {
            return '-';
        }
        return new Intl.NumberFormat('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(num);
    };

    const getFinancialYear = (purchaseDate, yearNum) => {
        let pYear = purchaseDate.getUTCFullYear();
        let pMonth = purchaseDate.getUTCMonth();
        let startYear = (pMonth < 3) ? pYear - 1 : pYear;
        const fyStartDate = new Date(Date.UTC(startYear + yearNum - 1, 3, 1));
        const fyEndDate = new Date(Date.UTC(startYear + yearNum, 2, 31));
        const fyString = `FY ${fyStartDate.getUTCFullYear()}-${fyEndDate.getUTCFullYear().toString().slice(-2)}`;
        return { fyStartDate, fyEndDate, fyString };
    };

    const calculateQuarterlyBreakdown = (totalDep, effectiveStartDate, effectiveEndDate, fyStartDate) => {
        if (totalDep <= 0) return { q1: 0, q2: 0, q3: 0, q4: 0 };
        
        let daysUsedInFY = (effectiveEndDate - effectiveStartDate) / (1000 * 3600 * 24) + 1;
        daysUsedInFY = Math.max(0, daysUsedInFY);
        if (daysUsedInFY <= 0) return { q1: 0, q2: 0, q3: 0, q4: 0 };

        const depPerDay = totalDep / daysUsedInFY;
        const q1_start = new Date(Date.UTC(fyStartDate.getUTCFullYear(), 3, 1));
        const q2_start = new Date(Date.UTC(fyStartDate.getUTCFullYear(), 6, 1));
        const q3_start = new Date(Date.UTC(fyStartDate.getUTCFullYear(), 9, 1));
        const q4_start = new Date(Date.UTC(fyStartDate.getUTCFullYear() + 1, 0, 1));

        const calcDaysInQuarter = (q_start, q_end) => {
            const start = Math.max(effectiveStartDate.getTime(), q_start.getTime());
            const end = Math.min(effectiveEndDate.getTime(), q_end.getTime());
            return Math.max(0, (end - start) / (1000 * 3600 * 24) + 1);
        };

        const daysInQ1 = calcDaysInQuarter(q1_start, new Date(q2_start.getTime() - 1));
        const daysInQ2 = calcDaysInQuarter(q2_start, new Date(q3_start.getTime() - 1));
        const daysInQ3 = calcDaysInQuarter(q3_start, new Date(q4_start.getTime() - 1));
        const daysInQ4 = calcDaysInQuarter(q4_start, new Date(Date.UTC(fyStartDate.getUTCFullYear() + 1, 2, 31)));

        return { q1: depPerDay * daysInQ1, q2: depPerDay * daysInQ2, q3: depPerDay * daysInQ3, q4: depPerDay * daysInQ4 };
    };

    const isLeapYear = (year) => (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);

});