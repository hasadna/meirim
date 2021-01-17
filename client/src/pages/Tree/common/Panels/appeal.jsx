import React from 'react';
import { TabPanel, TabBox, Typography, Button } from 'shared';
import { useTheme } from '@material-ui/styles';
import * as SC from './style';
import t from 'locale/he_IL';

const GUIDE_LINK = '/docs/מדריך להגשת ערר על כריתת עץ.pdf';
const TreeAppealPanel = () => {

	const theme = useTheme();

	return (
		<TabPanel>
			<TabBox>
				<SC.TreeSummaryTitleWrapper>
					<Typography variant="planDetailTitle" mobileVariant="planDetailTitle"
						component="h2" color={theme.palette.black}	>
						{t.treeAppealTitle}
					</Typography>
				</SC.TreeSummaryTitleWrapper>
				<Typography variant="paragraphText" mobileVariant="paragraphText"
					component="span" color={theme.palette.black}>
					{t.treeAppealExplained}
				</Typography>
				<SC.ButtonWrapper>
					<Button id="tree-appeal-button" text="כל מה שצריך לדעת על הגשת ערר באזורך"
					 small='small'  target="_blank" rel="noopener noreferrer" href={GUIDE_LINK} />
				</SC.ButtonWrapper>
			</TabBox>
		</TabPanel>
	)
}

export default TreeAppealPanel;