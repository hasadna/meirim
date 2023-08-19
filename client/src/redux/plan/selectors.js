import { useSelector } from 'react-redux';

const Selectors = () => {
	const planData = useSelector((state) => state.plan.planData);
	const dataUnits = useSelector((state) => state.plan.dataUnits);
	const textArea = useSelector((state) => state.plan.textArea);
	const dataArea = useSelector((state) => state.plan.dataArea);
	const planLinks = useSelector((state) => state.plan.planLinks);

	return {
		planData,
		dataUnits,
		textArea,
		dataArea,
		planLinks,
	};
};

export default Selectors;
