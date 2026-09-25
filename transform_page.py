import re

with open('src/components/ManageDepartmentsModal.tsx', 'r') as f:
    content = f.read()

# Replace imports
content = content.replace("import React, { useState, useEffect } from 'react';", "import React, { useState, useEffect } from 'react';\nimport { PageHeader } from './ui/PageHeader';\nimport { AppButton } from './ui/AppButton';")

# Change interface/props to match a page
content = re.sub(r'interface ManageDepartmentsModalProps.*?\n}', '', content, flags=re.DOTALL)
content = re.sub(r'export const ManageDepartmentsModal: React\.FC<ManageDepartmentsModalProps> = \({.*?}\) => {', 'export const DepartmentsManagementPage: React.FC = () => {', content, flags=re.DOTALL)

# Remove useEffect for `isOpen` checking
content = re.sub(r'useEffect\(\(\) => {\s*if \(isOpen\) {.*?}\s*}\s*}, \[isOpen\]\);', 'useEffect(() => {\n    // Scan for legacy names\n    const runScan = async () => {\n      try {\n        const allocs = await fetchAllAllocationsGlobal();\n        const allNames = allocs.map(a => a.unidade);\n        const uniqueNames = Array.from(new Set(allNames)).filter(Boolean);\n        const validMap = new Map(departments.map(d => [d.sigla, true]));\n        const legacy = uniqueNames.filter(name => !validMap.has(name));\n        setLegacyNames(legacy);\n      } catch (e) {\n        console.error("Error scanning legacy names:", e);\n      }\n    };\n    if (departments.length > 0) {\n      runScan();\n    }\n  }, [departments]);', content, flags=re.DOTALL)

# Remove onClose calls and footer
content = re.sub(r'<div style={{[^}]*}}>\s*<button type="button" onClick={onClose}[^>]*>\s*Fechar\s*</button>\s*</div>', '', content, flags=re.DOTALL)

# Replace the wrapper div with PageHeader
wrapper_pattern = r'<div className="modal-overlay"[^>]*>.*?<div className="modal-content"[^>]*>.*?<div className="modal-header"[^>]*>.*?<h2[^>]*>.*?</h2>.*?<button onClick={onClose}[^>]*>.*?</button>.*?</div>'
content = re.sub(wrapper_pattern, r'''<div className="page-container">
      <PageHeader 
        title="Departamentos e Unidades" 
        subtitle="Gerencie as unidades e diretorias oficiais para alocações"
      />''', content, flags=re.DOTALL)

# Also fix the end divs
content = content.replace('      </div>\n    </div>\n  );\n};', '    </div>\n  );\n};')

# Fix buttons to AppButton
content = content.replace('className="btn btn-primary"', 'variant="primary"')
content = content.replace('className="btn btn-secondary"', 'variant="outline"')
content = content.replace('<button', '<AppButton')
content = content.replace('</button>', '</AppButton>')

with open('src/components/admin/DepartmentsManagementPage.tsx', 'w') as f:
    f.write(content)

