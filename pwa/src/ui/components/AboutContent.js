import { defineComponent } from 'vue'

export const AboutContent = defineComponent({
    name: 'AboutContent',
    props: {
        appVersion: {
            type: String,
            default: '',
        },
        rulesVersion: {
            type: String,
            default: '',
        },
        thresholdsVersion: {
            type: String,
            default: '',
        },
    },
    emits: ['close'],
    template: `
        <div class="modal-header">
            <h2>About</h2>
            <button
                class="modal-close ghost"
                type="button"
                @click="$emit('close')"
                aria-label="Close about panel"
                autofocus
            >
                Close
            </button>
        </div>
        <div class="modal-content">
            <p class="eyebrow">
                Anonymous Payroll Reporter
                <span
                    v-if="rulesVersion && thresholdsVersion"
                    class="pill inline ghost"
                >Rules {{ rulesVersion }} · Thresholds {{ thresholdsVersion }}</span>
                <span class="pill inline ghost">Release {{ appVersion }}</span>

            </p>
            <h3>About The Project</h3>
            <p>
                This tool was created for a group of UK hospitality
                workers who found themselves in an impossible position:
                they trusted their employer to handle their pay, and
                pension contributions correctly, only to discover that
                trust had been badly abused. What happened to them isn't
                rare, and it should never fall on workers to become
                forensic accountants just to understand their own
                payslips.
            </p>
            <p>This project exists because they deserved better.</p>
            <h3>What this tool does</h3>
            <p>
                The Anonymous Payroll Reporter helps workers check
                whether their employer has been paying the correct holiday
                entitlements and pension contributions. It analyses payroll
                data and pension spreadsheets, highlights discrepancies, and
                produces a clear, worker&#8209;friendly report you can use to
                understand what's going on.
            </p>
            <p>
                It's designed for people who don't have HR departments,
                legal teams, or accountants behind them—just the right
                to be paid fairly.
            </p>
            <h3>Can I try it out without uploading my own files?</h3>
            <p>
                Yes. We provide a small training pack of dummy payslips
                and pension files so you can learn how the tool works.
                Download, unzip, and upload the files to follow along
                with the walkthrough.
            </p>
            <p>
                <a href="https://raw.githubusercontent.com/FairToolsWork/anonymous-payroll-reporter/main/demo_files/anonymous-payroll-reporter-demo-files.zip"
                    download="anonymous-payroll-reporter-demo-files.zip"
                    class="demo-download-link"
                >Download sample files
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" class="inline-icon"><!-- Icon from Material Symbols by Google - https://github.com/google/material-design-icons/blob/master/LICENSE --><path fill="currentColor" d="M8 17h8q.425 0 .713-.288T17 16t-.288-.712T16 15H8q-.425 0-.712.288T7 16t.288.713T8 17m3-6.85l-.9-.875Q9.825 9 9.413 9t-.713.3q-.275.275-.275.7t.275.7l2.6 2.6q.3.3.7.3t.7-.3l2.6-2.6q.275-.275.287-.687T15.3 9.3q-.275-.275-.687-.288t-.713.263l-.9.875V7q0-.425-.288-.712T12 6t-.712.288T11 7zM12 22q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9t2.137-3.175T8.1 2.788T12 2t3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22"/></svg>
                </a>
            </p>
            <h3>Will this work for me?</h3>
            <p>
                It depends on the payroll system your employer uses. The
                tool currently supports <b>Sage Payroll</b> and
                <b>Nest Pensions</b>, and it works best when your
                payslip follows the standard layout used by those
                systems.
            </p>
            <p>
                Because employers often customise their payslips—even
                when using the same payroll software—some layouts may
                not be recognised. If your payslip looks noticeably
                different from the example below, the tool may not
                interpret it correctly. The project is keen to expand
                support for additional payroll systems, so please let us
                know if you find yourself in this situation.
            </p>
            <p>
                To check compatibility, compare your payslip with the
                sample layout shown here. If the structure and labels
                are similar, the tool should work as expected. If not,
                you may see incomplete or inaccurate results.
            </p>
            <img
                src="/imgs/example-payslip.png"
                alt="Example payslip layout"
                width="566"
                height="375"
            />
            <h3>Open source and community&#8209;driven</h3>
            <p>
                The project lives here:
                <a
                    href="https://github.com/FairToolsWork/anonymous-payroll-reporter"
                    target="_blank"
                    rel="noopener"
                >https://github.com/FairToolsWork</a>
            </p>
            <p>
                If you find a bug or want to suggest an improvement, you
                can open an issue here:
                <a
                    href="https://github.com/FairToolsWork/anonymous-payroll-reporter/issues"
                >https://github.com/FairToolsWork/anonymous-payroll-reporter/issues</a>
            </p>
            <h3>Privacy &amp; Safety</h3>
            <p>
                Your data never leaves your device. All calculations
                happen entirely in your browser. Nothing is uploaded,
                nothing is stored, and nothing is sent to any server.
                You can close the tab and walk away knowing your
                information stays with you.
            </p>
            <p>
                The code is fully open source and licensed under MIT, so
                anyone can inspect, audit, or improve it.
            </p>
            <h3>Why it's anonymous</h3>
            <p>
                Workers deserve tools that protect them. Many people
                cannot safely raise concerns about payroll errors or
                pension underpayments without risking retaliation. This
                tool gives you a way to understand the facts first,
                privately and safely, before deciding what to do next.
            </p>
            <h3>Credits &amp; Legal</h3>
            <p>
                This project was built for workers by a team of one, and
                aspires to grow with workers' needs.
                Contributions—technical or otherwise—are welcome.
            </p>
            <p class="credits-copyright">
                Sample fixtures include layouts derived from
                <b>Sage (UK) payroll documents</b> and
                <b>Nest Pension contribution reports</b>. These
                materials are used solely for testing and instructional
                demonstration within this project.
            </p>
            <p>
                &copy; Sage (UK) Limited. All rights reserved. <br />
                &copy; Nest Pensions. All rights reserved.
            </p>
            <p>
                All <b>Sage</b> and <b>Nest</b> names, trademarks, and
                logos remain the property of their respective owners.
            </p>
            <p>
                <b>
                    These notices apply only to the original marks and
                    materials of Sage (UK) Ltd and Nest Pensions; all
                    documents generated by this project are independent
                    works and are not affiliated with or endorsed by
                    either organisation.
                </b>
            </p>
            <h3>Colophon</h3>
            <ul class="colophon">
                <li>
                    Icons:
                    <a href="https://fonts.google.com/icons/">Material Symbols by Google</a>
                </li>
                <li>
                    Typeface:
                    <a href="https://fonts.google.com/specimen/Space+Grotesk">Space Grotesk by Florian Karsten</a>
                </li>
            </ul>
        </div>
    `,
})
