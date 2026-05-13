import { Chip, Collapse, Divider } from '@material-ui/core';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { useTheme } from '@material-ui/styles';
import { useTranslation } from 'locale/he_IL';
import PropTypes from 'prop-types';
import React, { useState } from 'react';
import { TreeSelectors } from 'redux/selectors';
import { TabBox, TabPanel, Typography } from 'shared';
import { timeToObjectionText } from '../../utils';
import * as SC from './style';

const TreeList = ({ trees_per_permit }) => {
	if (!trees_per_permit) return null;

	if (Object.keys(trees_per_permit).length === 1) {
		return (
			<SC.TreeTermsWrapper>
				<SC.TreeTermWrapper>
					<Chip label={Object.keys(trees_per_permit)[0]} />
				</SC.TreeTermWrapper>
			</SC.TreeTermsWrapper>
		);
	}

	return (
		<SC.TreeTermsWrapper>
			{Object.entries(trees_per_permit).map(([name, number], index) => (
				<SC.TreeTermWrapper key={index}>
					<Chip label={`${name} (${number})`} />
				</SC.TreeTermWrapper>
			))}
		</SC.TreeTermsWrapper>
	);
};

const TreeDetailsPanel = () => {
	const { t } = useTranslation();
	const theme = useTheme();
	const { treeData: { action, permit_number, total_trees, trees_per_permit, last_date_to_objection, url } } = TreeSelectors();

	const valid_permit_number = /meirim/.test(permit_number) ? 'לא צוין' : permit_number;
	const isGroupedByAction = trees_per_permit && typeof Object.values(trees_per_permit)[0] === 'object';
	const [conservationOpen, setConservationOpen] = useState(false);

	const treeCountText = (n) => n === 0 ? 'לא צוין מספר העצים' : n === 1 ? 'עץ אחד' : `${n} עצים`;

	return (
		<TabPanel>
			<TabBox>

				{isGroupedByAction ? (
					['כריתה', 'העתקה', 'שימור'].filter(k => trees_per_permit[k]).map((actionKey, idx) => {
					const trees = trees_per_permit[actionKey];
					const actionTotal = Object.values(trees).reduce((sum, n) => sum + n, 0);
						const isConservation = actionKey === 'שימור';
						return (
							<React.Fragment key={idx}>
								{idx > 0 && <Divider style={{ margin: '0.75rem 0' }} />}
								<SC.TreeSummaryTitleWrapper
									onClick={isConservation ? () => setConservationOpen(o => !o) : undefined}
									style={isConservation ? { cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } : {}}>
									<Typography variant="planDetailTitle" mobileVariant="planDetailTitle"
										component="h2" color={theme.palette.black}>
										{`עצים ל${actionKey}`}
									</Typography>
									{isConservation && (conservationOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />)}
								</SC.TreeSummaryTitleWrapper>
								<Collapse in={isConservation ? conservationOpen : true}>
									<SC.StatusAndTypeWrapper>
										<SC.TotalTreeWrapper>
											<Chip label={treeCountText(actionTotal)} />
											<Typography variant="paragraphText" mobileVariant="paragraphText"
												component="span" color={theme.palette.black}>
												{' מסוג '}
											</Typography>
										</SC.TotalTreeWrapper>
										<SC.TreeTermsWrapper>
											{Object.entries(trees).map(([name, count], i) => (
												<SC.TreeTermWrapper key={i}>
													<Chip label={`${name} (${count})`} />
												</SC.TreeTermWrapper>
											))}
										</SC.TreeTermsWrapper>
									</SC.StatusAndTypeWrapper>
								</Collapse>
							</React.Fragment>
						);
					})
				) : (
					<>
						<SC.TreeSummaryTitleWrapper>
							<Typography variant="planDetailTitle" mobileVariant="planDetailTitle"
								component="h2" color={theme.palette.black}>
								{`עצים ל${action}`}
							</Typography>
						</SC.TreeSummaryTitleWrapper>
						<SC.StatusAndTypeWrapper>
							<SC.TotalTreeWrapper>
								<Chip label={treeCountText(total_trees)} />
								<Typography variant="paragraphText" mobileVariant="paragraphText"
									component="span" color={theme.palette.black}>
									{' מסוג '}
								</Typography>
							</SC.TotalTreeWrapper>
							<TreeList trees_per_permit={trees_per_permit} />
						</SC.StatusAndTypeWrapper>
					</>
				)}

				<SC.StatusAndTypeWrapper>
					<SC.StatusWrapper>
						<Typography variant="paragraphText" mobileVariant="paragraphText"
							component="span" color={theme.palette.gray['main']}>
							{`${t.lastDateToObjectTrees}: `}
						</Typography>
						<Typography variant="paragraphText" mobileVariant="paragraphText"
							component="span" color={theme.palette.black}>
							{last_date_to_objection && new Intl.DateTimeFormat('he-IL').format(new Date(last_date_to_objection))}
							{` (${timeToObjectionText(last_date_to_objection)})`}
						</Typography>
					</SC.StatusWrapper>
				</SC.StatusAndTypeWrapper>

				<SC.StatusAndTypeWrapper>
					<SC.StatusWrapper>
						<Typography variant="paragraphText" mobileVariant="paragraphText"
							component="span" color={theme.palette.gray['main']}>
							{`${t.permitNumber} `}
						</Typography>
						<Typography variant="paragraphText" mobileVariant="paragraphText"
							component="span" color={theme.palette.black}>
							{valid_permit_number}
						</Typography>
					</SC.StatusWrapper>
				</SC.StatusAndTypeWrapper>

				<SC.UrlWrapper>
					<a target="_blank" rel="noopener noreferrer" href={url}>{t.treePermitOnGovSite}</a>
					<SC.CustomLinkIcon></SC.CustomLinkIcon>
				</SC.UrlWrapper>

			</TabBox>
		</TabPanel>
	);
};


TreeDetailsPanel.propTypes = {
	type: PropTypes.string,
	status: PropTypes.string,
	url: PropTypes.string,
};

export default TreeDetailsPanel;